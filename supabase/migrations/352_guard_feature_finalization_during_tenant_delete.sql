-- A tenant cascade may delete guild_feature_states before one of the domain
-- rows whose AFTER DELETE trigger asks to finalize a draining feature. Missing
-- feature state means there is nothing left to finalize; do not attempt to
-- create an audit event with null snapshots or recreate legacy settings.

create or replace function public.finalize_draining_guild_feature(
  p_guild_id uuid,
  p_feature_key text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous public.guild_feature_states%rowtype;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':feature:' || p_feature_key, 0)
  );
  select * into v_previous
    from public.guild_feature_states feature
   where feature.guild_id = p_guild_id
     and feature.feature_key = p_feature_key
   for update;

  if v_previous.guild_id is null then
    return false;
  end if;
  if v_previous.state <> 'draining'
     or public.guild_feature_has_open_work(p_guild_id, p_feature_key) then
    return false;
  end if;

  update public.guild_feature_states
     set state = 'disabled', updated_at = now()
   where guild_id = p_guild_id and feature_key = p_feature_key;
  insert into public.guild_feature_state_events (
    guild_id, feature_key, from_state, to_state,
    from_config, to_config, source
  ) values (
    p_guild_id, p_feature_key, 'draining', 'disabled',
    v_previous.config, v_previous.config, 'draining_complete'
  );

  if p_feature_key = 'supply' then
    insert into public.app_settings (guild_id, key, value, updated_at)
    values (p_guild_id, 'regear_support_enabled', 'false', now())
    on conflict (guild_id, key) do update
      set value = excluded.value, updated_at = excluded.updated_at;
  end if;
  return true;
end;
$$;

revoke all on function public.finalize_draining_guild_feature(uuid, text)
  from public, anon, authenticated;
grant execute on function public.finalize_draining_guild_feature(uuid, text)
  to service_role;

comment on function public.finalize_draining_guild_feature(uuid, text) is
  'Finalizes a drained feature, or no-ops when tenant cascade already removed the feature state.';
