-- Release C forward fix: central commands project legacy boolean settings for
-- compatibility. When the requested central state is setup_required, the
-- legacy `false` write must not immediately collapse it to disabled.

create or replace function public.sync_legacy_setting_to_guild_feature_state()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feature_key text;
  v_previous public.guild_feature_states%rowtype;
  v_current_state text;
  v_state text;
  v_config jsonb := '{}'::jsonb;
  v_mode text;
begin
  if new.key in ('regear_support_enabled', 'craft_regear_enabled') then
    v_feature_key := 'supply';
    select feature.state into v_current_state
      from public.guild_feature_states feature
     where feature.guild_id = new.guild_id
       and feature.feature_key = v_feature_key;
    select case setting.value when 'true' then 'craft' else 'silver' end
      into v_mode
      from public.app_settings setting
     where setting.guild_id = new.guild_id
       and setting.key = 'craft_regear_enabled';
    if new.key = 'craft_regear_enabled' then
      v_mode := case new.value when 'true' then 'craft' else 'silver' end;
    end if;
    v_config := jsonb_build_object('mode', coalesce(v_mode, 'silver'));
    if new.key = 'regear_support_enabled' then
      if new.value = 'true' then
        v_state := 'enabled';
      elsif v_current_state = 'setup_required' then
        v_state := 'setup_required';
      elsif public.guild_feature_has_open_work(new.guild_id, v_feature_key) then
        v_state := 'draining';
      else
        v_state := 'disabled';
      end if;
    else
      v_state := coalesce(v_current_state, 'setup_required');
    end if;
  elsif new.key = 'tactics_experimental_enabled' then
    v_feature_key := 'tactics';
    select feature.state into v_current_state
      from public.guild_feature_states feature
     where feature.guild_id = new.guild_id
       and feature.feature_key = v_feature_key;
    v_state := case
      when new.value = 'true' then 'enabled'
      when v_current_state = 'setup_required' then 'setup_required'
      else 'disabled'
    end;
  elsif new.key = 'guild_profile_enabled' then
    v_feature_key := 'public_guild_profile';
    select feature.state into v_current_state
      from public.guild_feature_states feature
     where feature.guild_id = new.guild_id
       and feature.feature_key = v_feature_key;
    v_state := case
      when new.value = 'true' then 'enabled'
      when v_current_state = 'setup_required' then 'setup_required'
      else 'disabled'
    end;
  else
    return new;
  end if;

  select * into v_previous
    from public.guild_feature_states feature
   where feature.guild_id = new.guild_id
     and feature.feature_key = v_feature_key;

  insert into public.guild_feature_states (
    guild_id, feature_key, state, config, updated_at
  ) values (
    new.guild_id, v_feature_key, v_state, v_config, now()
  )
  on conflict (guild_id, feature_key) do update
    set state = excluded.state,
        config = case
          when excluded.feature_key = 'supply' then excluded.config
          else public.guild_feature_states.config
        end,
        updated_at = case
          when public.guild_feature_states.state is distinct from excluded.state
            or public.guild_feature_states.config is distinct from (
              case when excluded.feature_key = 'supply'
                then excluded.config
                else public.guild_feature_states.config
              end
            )
          then now()
          else public.guild_feature_states.updated_at
        end;

  if v_previous.feature_key is null
     or v_previous.state is distinct from v_state
     or (v_feature_key = 'supply' and v_previous.config is distinct from v_config) then
    insert into public.guild_feature_state_events (
      guild_id, feature_key, from_state, to_state,
      from_config, to_config, source
    ) values (
      new.guild_id,
      v_feature_key,
      v_previous.state,
      v_state,
      coalesce(v_previous.config, '{}'::jsonb),
      v_config,
      'legacy_setting_sync'
    );
  end if;
  return new;
end;
$$;

revoke all on function public.sync_legacy_setting_to_guild_feature_state()
  from public, anon, authenticated, service_role;

comment on function public.sync_legacy_setting_to_guild_feature_state() is
  'Compatibility projection from legacy booleans. A central setup_required state survives its required false projection; explicit central disabled commands still remain disabled.';
