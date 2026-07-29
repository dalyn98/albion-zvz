-- 306: Backfill the unified Discord role → capability authority.
--
-- Existing admin/event-creator/bomb-caller role settings are preserved as
-- compatibility projections, while their meaning is copied into
-- permission_role_grants. Existing user overrides receive a bounded migration
-- lifetime instead of remaining permanent.

update public.permission_role_grants
   set discord_role_name = discord_role_id
 where discord_role_name is null
    or length(btrim(discord_role_name)) = 0;

update public.permission_role_grants
   set capabilities = 0
 where capabilities < 0;

insert into public.admin_audit_log (
  guild_id,
  admin_discord_id,
  action,
  target_id,
  target_kind,
  details
)
select
  grant_row.guild_id,
  'system:permission-unification',
  'permission.role.delete',
  grant_row.discord_role_id,
  'permission_role',
  jsonb_build_object(
    'reason', 'Malformed non-Discord role mapping retired during migration',
    'beforeCapabilities', grant_row.capabilities::text
  )
from public.permission_role_grants as grant_row
where grant_row.discord_role_id !~ '^[0-9]{17,20}$';

delete from public.permission_role_grants
where discord_role_id !~ '^[0-9]{17,20}$';

update public.permission_user_overrides
   set capabilities_granted =
         greatest(capabilities_granted, 0) & ~greatest(capabilities_revoked, 0),
       capabilities_revoked = greatest(capabilities_revoked, 0),
       reason = coalesce(
         nullif(btrim(reason), ''),
         case
           when char_length(btrim(notes)) >= 5 then btrim(notes)
           else null
         end,
         'Migrated time-limited permission exception'
       ),
       expires_at = greatest(
         least(
           coalesce(expires_at, clock_timestamp() + interval '30 days'),
           clock_timestamp() + interval '30 days'
         ),
         granted_at + interval '1 second'
       );

-- Local guild accounts and malformed legacy identifiers must never receive an
-- operational capability. Keep the row for inspection, but make it inactive.
update public.permission_user_overrides
   set revoked_at = greatest(
         coalesce(revoked_at, clock_timestamp()),
         granted_at
       ),
       revoked_reason = coalesce(
         case
           when char_length(btrim(revoked_reason)) >= 5
             then btrim(revoked_reason)
           else null
         end,
         'Invalid non-Discord subject retired during permission unification'
       )
 where discord_id !~ '^[0-9]{17,20}$';

update public.permission_user_overrides
   set revoked_at = greatest(
         coalesce(revoked_at, clock_timestamp()),
         granted_at
       ),
       revoked_reason = coalesce(
         case
           when char_length(btrim(revoked_reason)) >= 5
             then btrim(revoked_reason)
           else null
         end,
         'Empty legacy exception retired during permission unification'
       )
 where capabilities_granted = 0
   and capabilities_revoked = 0;

insert into public.admin_audit_log (
  guild_id,
  admin_discord_id,
  action,
  target_id,
  target_kind,
  details
)
select
  grant_row.guild_id,
  'system:permission-unification',
  'permission.role.delete',
  grant_row.discord_role_id,
  'permission_role',
  jsonb_build_object(
    'reason', 'Empty capability mapping retired during migration',
    'beforeCapabilities', grant_row.capabilities::text
  )
from public.permission_role_grants as grant_row
where grant_row.capabilities = 0;

delete from public.permission_role_grants
where capabilities = 0;

-- GUILD_ADMIN = bit 34. Tenant owners remain bootstrap administrators even
-- without a mapped role; configured admin roles become the full-admin marker.
insert into public.permission_role_grants (
  guild_id,
  discord_role_id,
  discord_role_name,
  capabilities,
  granted_by_discord_id,
  notes
)
select
  tenant.id,
  role_id,
  role_id,
  17179869184::bigint,
  coalesce(tenant.created_by_discord_id, 'system:permission-unification'),
  'Migrated from tenants.admin_role_ids'
from public.tenants as tenant
cross join lateral unnest(coalesce(tenant.admin_role_ids, '{}'::text[]))
  as role_id
where length(btrim(role_id)) > 0
  and role_id ~ '^[0-9]{17,20}$'
on conflict (guild_id, discord_role_id) do update
set capabilities =
      public.permission_role_grants.capabilities | excluded.capabilities,
    discord_role_name = coalesce(
      nullif(public.permission_role_grants.discord_role_name, ''),
      excluded.discord_role_name
    ),
    updated_at = clock_timestamp();

do $$
declare
  v_setting record;
  v_roles jsonb;
  v_role_id text;
  v_capability bigint;
  v_note text;
  v_actor text;
begin
  for v_setting in
    select
      setting.guild_id,
      setting.key,
      setting.value,
      tenant.created_by_discord_id
    from public.app_settings as setting
    join public.tenants as tenant on tenant.id = setting.guild_id
    where setting.key in (
      'event_creator_role_ids',
      'event_creator_role_ids_combat',
      'event_creator_role_ids_ff',
      'event_creator_role_ids_ganking',
      'bomb_squad_caller_role_ids'
    )
  loop
    begin
      v_roles := v_setting.value::jsonb;
    exception when others then
      continue;
    end;
    if jsonb_typeof(v_roles) <> 'array' then continue; end if;

    v_capability := case v_setting.key
      when 'event_creator_role_ids' then 224::bigint
      when 'event_creator_role_ids_combat' then 32::bigint
      when 'event_creator_role_ids_ff' then 64::bigint
      when 'event_creator_role_ids_ganking' then 128::bigint
      when 'bomb_squad_caller_role_ids' then 131072::bigint
      else 0::bigint
    end;
    v_note := 'Migrated from app_settings.' || v_setting.key;
    v_actor := coalesce(
      v_setting.created_by_discord_id,
      'system:permission-unification'
    );

    for v_role_id in
      select value
      from jsonb_array_elements_text(v_roles)
    loop
      if v_role_id !~ '^[0-9]{17,20}$' then continue; end if;
      insert into public.permission_role_grants (
        guild_id,
        discord_role_id,
        discord_role_name,
        capabilities,
        granted_by_discord_id,
        notes
      ) values (
        v_setting.guild_id,
        v_role_id,
        v_role_id,
        v_capability,
        v_actor,
        v_note
      )
      on conflict (guild_id, discord_role_id) do update
      set capabilities =
            public.permission_role_grants.capabilities |
            excluded.capabilities,
          discord_role_name = coalesce(
            nullif(public.permission_role_grants.discord_role_name, ''),
            excluded.discord_role_name
          ),
          updated_at = clock_timestamp();
    end loop;
  end loop;
end;
$$;
