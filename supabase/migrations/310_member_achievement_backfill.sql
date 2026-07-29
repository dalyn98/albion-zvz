-- 310: Expose a bounded, resumable historical achievement backfill.
--
-- Do not scan every tenant inside the schema migration transaction. Normal
-- battle/kill syncs already evaluate one guild at a time; operations may call
-- this service-role RPC in small batches after the application deployment.

create or replace function public.backfill_member_achievements_batch(
  p_after_guild_id uuid default null,
  p_limit integer default 10
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant record;
  v_processed integer := 0;
  v_inserted integer := 0;
  v_next_guild_id uuid := p_after_guild_id;
  v_done boolean;
begin
  if p_limit is null or p_limit not between 1 and 25 then
    raise exception 'INVALID_ACHIEVEMENT_BACKFILL_LIMIT';
  end if;

  for v_tenant in
    select tenant.id
      from public.tenants as tenant
     where p_after_guild_id is null
        or tenant.id > p_after_guild_id
     order by tenant.id
     limit p_limit
  loop
    v_inserted :=
      v_inserted + public.evaluate_member_achievements(v_tenant.id);
    v_processed := v_processed + 1;
    v_next_guild_id := v_tenant.id;
  end loop;

  select not exists (
    select 1
      from public.tenants as tenant
     where v_next_guild_id is null
        or tenant.id > v_next_guild_id
  )
  into v_done;

  return jsonb_build_object(
    'processedGuilds', v_processed,
    'insertedAchievements', v_inserted,
    'nextGuildId', v_next_guild_id,
    'done', v_done
  );
end;
$$;

revoke all on function public.backfill_member_achievements_batch(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.backfill_member_achievements_batch(uuid, integer)
  to service_role;
