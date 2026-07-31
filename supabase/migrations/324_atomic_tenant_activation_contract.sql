-- One authoritative activation gate for self-serve Discord onboarding.
--
-- Optional features and the operating guide are deliberately absent. A tenant
-- becomes active only after the Discord, timezone, Albion home-guild, and
-- regear-support decisions that every guild needs are all persisted.

create or replace function public.activate_tenant_after_onboarding(
  p_guild_id uuid,
  p_actor_discord_id text
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant public.tenants%rowtype;
  v_timezone text;
  v_albion_server text;
  v_home_guild_id text;
  v_home_guild_name text;
  v_regear_support text;
  v_craft_regear text;
  v_events_auto_start text;
begin
  select tenant.*
    into v_tenant
    from public.tenants tenant
   where tenant.id = p_guild_id
   for update;

  if v_tenant.id is null then
    raise exception 'TENANT_NOT_FOUND';
  end if;
  if nullif(btrim(coalesce(p_actor_discord_id, '')), '') is null
     or v_tenant.created_by_discord_id is distinct from p_actor_discord_id then
    raise exception 'ONBOARDING_OWNER_REQUIRED';
  end if;
  if v_tenant.status not in ('pending', 'active') then
    raise exception 'TENANT_NOT_ACTIVATABLE';
  end if;
  if v_tenant.bot_installed_at is null then
    raise exception 'ONBOARDING_BOT_REQUIRED';
  end if;
  if cardinality(v_tenant.member_role_ids) = 0
     or cardinality(v_tenant.admin_role_ids) = 0 then
    raise exception 'ONBOARDING_ROLES_REQUIRED';
  end if;
  if nullif(btrim(coalesce(v_tenant.event_channel_id, '')), '') is null then
    raise exception 'ONBOARDING_EVENT_CHANNEL_REQUIRED';
  end if;

  select
    max(setting.value) filter (where setting.key = 'tenant_timezone'),
    max(setting.value) filter (where setting.key = 'albion_server'),
    max(setting.value) filter (where setting.key = 'albion_home_guild_id'),
    max(setting.value) filter (where setting.key = 'albion_home_guild_name'),
    max(setting.value) filter (where setting.key = 'regear_support_enabled'),
    max(setting.value) filter (where setting.key = 'craft_regear_enabled'),
    max(setting.value) filter (where setting.key = 'events_auto_start_enabled')
    into
      v_timezone,
      v_albion_server,
      v_home_guild_id,
      v_home_guild_name,
      v_regear_support,
      v_craft_regear,
      v_events_auto_start
    from public.app_settings setting
   where setting.guild_id = p_guild_id
     and setting.key in (
       'tenant_timezone',
       'albion_server',
       'albion_home_guild_id',
       'albion_home_guild_name',
       'regear_support_enabled',
       'craft_regear_enabled',
       'events_auto_start_enabled'
     );

  if nullif(btrim(coalesce(v_timezone, '')), '') is null
     or not exists (
       select 1
         from pg_catalog.pg_timezone_names timezone
        where timezone.name = v_timezone
     ) then
    raise exception 'ONBOARDING_TIMEZONE_REQUIRED';
  end if;
  if coalesce(v_albion_server, '') not in ('west', 'east', 'europe')
     or nullif(btrim(coalesce(v_home_guild_id, '')), '') is null
     or nullif(btrim(coalesce(v_home_guild_name, '')), '') is null then
    raise exception 'ONBOARDING_HOME_GUILD_REQUIRED';
  end if;
  if coalesce(v_regear_support, '') not in ('true', 'false') then
    raise exception 'ONBOARDING_REGEAR_SUPPORT_REQUIRED';
  end if;
  if v_regear_support = 'true'
     and coalesce(v_craft_regear, '') not in ('true', 'false') then
    raise exception 'ONBOARDING_REGEAR_MODE_REQUIRED';
  end if;
  if coalesce(v_events_auto_start, '') not in ('true', 'false') then
    raise exception 'ONBOARDING_EVENT_START_REQUIRED';
  end if;

  update public.tenants tenant
     set status = 'active'
   where tenant.id = p_guild_id;

  return v_tenant.slug;
end;
$$;

revoke all on function public.activate_tenant_after_onboarding(uuid, text)
  from public, anon, authenticated;
grant execute on function public.activate_tenant_after_onboarding(uuid, text)
  to service_role;

comment on function public.activate_tenant_after_onboarding(uuid, text) is
  'Atomically validates mandatory self-serve onboarding state and activates only the tenant owned by the actor. Optional features and guide completion never block activation.';
