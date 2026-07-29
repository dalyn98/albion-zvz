-- 307: Make Discord role → capability the only permission authority.
--
-- Legacy tenants.admin_role_ids and the event/caller app settings are retained
-- as write-through projections for older Discord command code. Protected web
-- commands resolve the live Discord member against permission_role_grants.
-- Role and emergency-user changes are atomic, optimistic, audited commands.

alter table public.permission_role_grants
  alter column discord_role_name set not null;

alter table public.permission_user_overrides
  alter column reason set not null,
  alter column expires_at set not null;

alter table public.permission_role_grants
  add constraint permission_role_grants_role_id_format_check
    check (discord_role_id ~ '^[0-9]{17,20}$'),
  add constraint permission_role_grants_role_name_check
    check (char_length(btrim(discord_role_name)) between 1 and 100),
  add constraint permission_role_grants_capabilities_check
    check (capabilities between 1 and 34359738367),
  add constraint permission_role_grants_notes_check
    check (char_length(notes) <= 500);

alter table public.permission_user_overrides
  add constraint permission_user_overrides_subject_check
    check (
      revoked_at is not null
      or discord_id ~ '^[0-9]{17,20}$'
    ),
  add constraint permission_user_overrides_capabilities_check
    check (
      capabilities_granted between 0 and 34359738367
      and capabilities_revoked between 0 and 34359738367
      and (capabilities_granted & capabilities_revoked) = 0
      and (
        revoked_at is not null
        or capabilities_granted <> 0
        or capabilities_revoked <> 0
      )
    ),
  add constraint permission_user_overrides_reason_check
    check (char_length(btrim(reason)) between 5 and 500),
  add constraint permission_user_overrides_expiry_check
    check (expires_at > granted_at),
  add constraint permission_user_overrides_revocation_check
    check (
      (
        revoked_at is null
        and revoked_by_discord_id is null
        and revoked_reason is null
      )
      or (
        revoked_at is not null
        and revoked_at >= granted_at
        and char_length(btrim(coalesce(revoked_reason, ''))) between 5 and 500
      )
    ),
  add constraint permission_user_overrides_notes_check
    check (char_length(notes) <= 500);

create or replace function public.sync_permission_role_legacy_projection(
  p_guild_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_roles text[];
  v_combat_roles text[];
  v_ff_roles text[];
  v_ganking_roles text[];
  v_bomb_roles text[];
begin
  if p_guild_id is null
    or not exists (
      select 1 from public.tenants where id = p_guild_id
    ) then
    raise exception 'INVALID_PERMISSION_GUILD';
  end if;

  select
    coalesce(
      array_agg(discord_role_id order by discord_role_id)
        filter (where (capabilities & 17179869184::bigint) <> 0),
      '{}'::text[]
    ),
    coalesce(
      array_agg(discord_role_id order by discord_role_id)
        filter (where (capabilities & 32::bigint) <> 0),
      '{}'::text[]
    ),
    coalesce(
      array_agg(discord_role_id order by discord_role_id)
        filter (where (capabilities & 64::bigint) <> 0),
      '{}'::text[]
    ),
    coalesce(
      array_agg(discord_role_id order by discord_role_id)
        filter (where (capabilities & 128::bigint) <> 0),
      '{}'::text[]
    ),
    coalesce(
      array_agg(discord_role_id order by discord_role_id)
        filter (where (capabilities & 131072::bigint) <> 0),
      '{}'::text[]
    )
  into
    v_admin_roles,
    v_combat_roles,
    v_ff_roles,
    v_ganking_roles,
    v_bomb_roles
  from public.permission_role_grants
  where guild_id = p_guild_id;

  update public.tenants
     set admin_role_ids = v_admin_roles
   where id = p_guild_id
     and admin_role_ids is distinct from v_admin_roles;

  insert into public.app_settings (guild_id, key, value, updated_at)
  values
    (p_guild_id, 'event_creator_role_ids', '[]', clock_timestamp()),
    (p_guild_id, 'event_creator_role_ids_combat', to_jsonb(v_combat_roles)::text, clock_timestamp()),
    (p_guild_id, 'event_creator_role_ids_ff', to_jsonb(v_ff_roles)::text, clock_timestamp()),
    (p_guild_id, 'event_creator_role_ids_ganking', to_jsonb(v_ganking_roles)::text, clock_timestamp()),
    (p_guild_id, 'bomb_squad_caller_role_ids', to_jsonb(v_bomb_roles)::text, clock_timestamp())
  on conflict (guild_id, key) do update
  set value = excluded.value,
      updated_at = case
        when public.app_settings.value is distinct from excluded.value
          then excluded.updated_at
        else public.app_settings.updated_at
      end;
end;
$$;

revoke all on function public.sync_permission_role_legacy_projection(uuid)
  from public, anon, authenticated;
grant execute on function public.sync_permission_role_legacy_projection(uuid)
  to service_role;

create or replace function public.capture_permission_role_legacy_projection()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild_id uuid;
begin
  if tg_op = 'DELETE' then
    v_guild_id := old.guild_id;
  else
    v_guild_id := new.guild_id;
  end if;

  -- A grant written by one of the legacy compatibility triggers is already
  -- the projection target. Projecting it back while the outer statement still
  -- holds a tenants/app_settings row lock can invert the advisory-lock order
  -- and deadlock concurrent previous-app writes.
  if pg_trigger_depth() > 1
    or not exists (
      select 1 from public.tenants where id = v_guild_id
    ) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  perform public.sync_permission_role_legacy_projection(v_guild_id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.capture_permission_role_legacy_projection()
  from public, anon, authenticated;
grant execute on function public.capture_permission_role_legacy_projection()
  to service_role;

drop trigger if exists permission_role_grants_legacy_projection
  on public.permission_role_grants;
create trigger permission_role_grants_legacy_projection
after insert or delete or update of capabilities, discord_role_id
on public.permission_role_grants
for each row execute function public.capture_permission_role_legacy_projection();

do $$
declare
  v_guild record;
begin
  for v_guild in select id from public.tenants loop
    perform public.sync_permission_role_legacy_projection(v_guild.id);
  end loop;
end;
$$;

-- Rolling deployments can briefly run the previous application after this
-- database migration. Keep legacy writes flowing into the unified authority
-- until a later contract-only release removes the bridge. Projection-triggered
-- legacy writes are ignored by pg_trigger_depth() so the two directions cannot
-- recurse.
create or replace function public.sync_legacy_permission_roles_to_grants(
  p_guild_id uuid,
  p_role_ids text[],
  p_capabilities bigint,
  p_source text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text;
begin
  if p_guild_id is null
    or p_capabilities not in (
      17179869184::bigint,
      224::bigint,
      32::bigint,
      64::bigint,
      128::bigint,
      131072::bigint
    )
    or p_source is null then
    raise exception 'INVALID_LEGACY_PERMISSION_PROJECTION';
  end if;

  select coalesce(
    tenant.created_by_discord_id,
    'system:permission-compatibility'
  )
  into v_actor
  from public.tenants as tenant
  where tenant.id = p_guild_id;
  if not found then
    raise exception 'INVALID_PERMISSION_GUILD';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':permission-roles', 0)
  );

  delete from public.permission_role_grants as grant_row
   where grant_row.guild_id = p_guild_id
     and (grant_row.capabilities & p_capabilities) <> 0
     and (grant_row.capabilities & ~p_capabilities) = 0
     and not (
       grant_row.discord_role_id = any(coalesce(p_role_ids, '{}'::text[]))
       and grant_row.discord_role_id ~ '^[0-9]{17,20}$'
     );

  update public.permission_role_grants as grant_row
     set capabilities = grant_row.capabilities & ~p_capabilities,
         updated_at = clock_timestamp(),
         notes = concat(
           'Rolling compatibility sync from ',
           p_source
         )
   where grant_row.guild_id = p_guild_id
     and (grant_row.capabilities & p_capabilities) <> 0
     and (grant_row.capabilities & ~p_capabilities) <> 0
     and not (
       grant_row.discord_role_id = any(coalesce(p_role_ids, '{}'::text[]))
       and grant_row.discord_role_id ~ '^[0-9]{17,20}$'
     );

  insert into public.permission_role_grants (
    guild_id,
    discord_role_id,
    discord_role_name,
    capabilities,
    granted_by_discord_id,
    notes
  )
  select
    p_guild_id,
    desired.role_id,
    desired.role_id,
    p_capabilities,
    v_actor,
    concat('Rolling compatibility sync from ', p_source)
  from (
    select distinct btrim(role_id) as role_id
    from unnest(coalesce(p_role_ids, '{}'::text[])) as role_id
    where btrim(role_id) ~ '^[0-9]{17,20}$'
  ) as desired
  on conflict (guild_id, discord_role_id) do update
  set capabilities =
        public.permission_role_grants.capabilities |
        excluded.capabilities,
      updated_at = clock_timestamp(),
      notes = excluded.notes
  where (
    public.permission_role_grants.capabilities &
    excluded.capabilities
  ) <> excluded.capabilities;
end;
$$;

revoke all on function public.sync_legacy_permission_roles_to_grants(
  uuid, text[], bigint, text
) from public, anon, authenticated, service_role;

create or replace function public.capture_legacy_tenant_permission_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;

  perform public.sync_legacy_permission_roles_to_grants(
    new.id,
    new.admin_role_ids,
    17179869184::bigint,
    'tenants.admin_role_ids'
  );
  return new;
end;
$$;

revoke all on function public.capture_legacy_tenant_permission_roles()
  from public, anon, authenticated, service_role;

drop trigger if exists tenants_legacy_permission_roles_to_grants
  on public.tenants;
create trigger tenants_legacy_permission_roles_to_grants
after insert or update of admin_role_ids
on public.tenants
for each row execute function public.capture_legacy_tenant_permission_roles();

create or replace function public.capture_legacy_app_setting_permission_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild_id uuid;
  v_key text;
  v_value text;
  v_roles_json jsonb;
  v_roles text[];
  v_capabilities bigint;
begin
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_guild_id := old.guild_id;
    v_key := old.key;
    v_value := '[]';
  else
    v_guild_id := new.guild_id;
    v_key := new.key;
    v_value := new.value;
  end if;

  v_capabilities := case v_key
    when 'event_creator_role_ids' then 224::bigint
    when 'event_creator_role_ids_combat' then 32::bigint
    when 'event_creator_role_ids_ff' then 64::bigint
    when 'event_creator_role_ids_ganking' then 128::bigint
    when 'bomb_squad_caller_role_ids' then 131072::bigint
    else null
  end;
  if v_capabilities is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  begin
    v_roles_json := v_value::jsonb;
  exception when others then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end;
  if jsonb_typeof(v_roles_json) <> 'array' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select coalesce(array_agg(value), '{}'::text[])
    into v_roles
    from jsonb_array_elements_text(v_roles_json);

  perform public.sync_legacy_permission_roles_to_grants(
    v_guild_id,
    v_roles,
    v_capabilities,
    'app_settings.' || v_key
  );

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.capture_legacy_app_setting_permission_roles()
  from public, anon, authenticated, service_role;

drop trigger if exists app_settings_legacy_permission_roles_to_grants
  on public.app_settings;
create trigger app_settings_legacy_permission_roles_to_grants
after insert or delete or update of value
on public.app_settings
for each row
execute function public.capture_legacy_app_setting_permission_roles();

create or replace function public.apply_permission_role_grant(
  p_guild_id uuid,
  p_discord_role_id text,
  p_discord_role_name text,
  p_capabilities bigint,
  p_actor_discord_id text,
  p_notes text,
  p_expected_updated_at timestamptz,
  p_affected_member_count integer,
  p_delete boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_before public.permission_role_grants%rowtype;
  v_after public.permission_role_grants%rowtype;
  v_found boolean := false;
begin
  if p_guild_id is null
    or coalesce(p_discord_role_id, '') !~ '^[0-9]{17,20}$'
    or char_length(btrim(coalesce(p_discord_role_name, ''))) not between 1 and 100
    or p_capabilities is null
    or p_capabilities not between 0 and 34359738367
    or coalesce(p_actor_discord_id, '') !~ '^[0-9]{17,20}$'
    or char_length(coalesce(p_notes, '')) > 500
    or coalesce(p_affected_member_count, -1) not between 0 and 1000000
    or p_delete is null then
    raise exception 'INVALID_PERMISSION_ROLE_INPUT';
  end if;
  if not p_delete and p_capabilities = 0 then
    raise exception 'EMPTY_PERMISSION_ROLE';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':permission-roles', 0)
  );

  select * into v_before
    from public.permission_role_grants
   where guild_id = p_guild_id
     and discord_role_id = p_discord_role_id
   for update;
  v_found := found;

  if v_found then
    if p_expected_updated_at is null
      or v_before.updated_at is distinct from p_expected_updated_at then
      raise exception 'PERMISSION_ROLE_CONFLICT';
    end if;
  elsif p_expected_updated_at is not null then
    raise exception 'PERMISSION_ROLE_CONFLICT';
  end if;

  if p_delete then
    if not v_found then
      return jsonb_build_object('changed', false, 'deleted', true);
    end if;
    delete from public.permission_role_grants
     where guild_id = p_guild_id
       and discord_role_id = p_discord_role_id;
  else
    insert into public.permission_role_grants (
      guild_id,
      discord_role_id,
      discord_role_name,
      capabilities,
      granted_by_discord_id,
      granted_at,
      updated_at,
      notes
    ) values (
      p_guild_id,
      p_discord_role_id,
      btrim(p_discord_role_name),
      p_capabilities,
      p_actor_discord_id,
      v_now,
      v_now,
      coalesce(p_notes, '')
    )
    on conflict (guild_id, discord_role_id) do update
    set discord_role_name = excluded.discord_role_name,
        capabilities = excluded.capabilities,
        granted_by_discord_id = excluded.granted_by_discord_id,
        updated_at = excluded.updated_at,
        notes = excluded.notes
    returning * into v_after;
  end if;

  insert into public.admin_audit_log (
    guild_id,
    admin_discord_id,
    action,
    target_id,
    target_kind,
    details
  ) values (
    p_guild_id,
    p_actor_discord_id,
    case when p_delete then 'permission.role.delete' else 'permission.role.update' end,
    p_discord_role_id,
    'permission_role',
    jsonb_build_object(
      'roleName', btrim(p_discord_role_name),
      'beforeCapabilities',
        case when v_found then v_before.capabilities::text else null end,
      'afterCapabilities',
        case when p_delete then null else v_after.capabilities::text end,
      'affectedMemberCount', p_affected_member_count,
      'notes', coalesce(p_notes, '')
    )
  );

  return jsonb_build_object(
    'changed', true,
    'deleted', p_delete,
    'discordRoleId', p_discord_role_id,
    'updatedAt', case when p_delete then null else v_after.updated_at end
  );
end;
$$;

revoke all on function public.apply_permission_role_grant(
  uuid, text, text, bigint, text, text, timestamptz, integer, boolean
) from public, anon, authenticated;
grant execute on function public.apply_permission_role_grant(
  uuid, text, text, bigint, text, text, timestamptz, integer, boolean
) to service_role;

-- Self-serve onboarding must create the same authority rows as the permission
-- editor. Only the tenant creator can replace the initial full-admin role set.
create or replace function public.replace_onboarding_permission_admin_roles(
  p_guild_id uuid,
  p_roles jsonb,
  p_actor_discord_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role jsonb;
  v_role_id text;
  v_role_name text;
  v_before_roles text[];
  v_after_roles text[];
begin
  if p_guild_id is null
    or p_roles is null
    or jsonb_typeof(p_roles) <> 'array'
    or jsonb_array_length(p_roles) not between 1 and 100
    or coalesce(p_actor_discord_id, '') !~ '^[0-9]{17,20}$'
    or not exists (
      select 1
      from public.tenants
      where id = p_guild_id
        and created_by_discord_id = p_actor_discord_id
    ) then
    raise exception 'INVALID_ONBOARDING_PERMISSION_ROLES';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':permission-roles', 0)
  );

  select coalesce(
    array_agg(discord_role_id order by discord_role_id),
    '{}'::text[]
  )
  into v_before_roles
  from public.permission_role_grants
  where guild_id = p_guild_id
    and (capabilities & 17179869184::bigint) <> 0;

  for v_role in select value from jsonb_array_elements(p_roles)
  loop
    v_role_id := v_role ->> 'id';
    v_role_name := btrim(v_role ->> 'name');
    if jsonb_typeof(v_role) <> 'object'
      or coalesce(v_role_id, '') !~ '^[0-9]{17,20}$'
      or char_length(v_role_name) not between 1 and 100 then
      raise exception 'INVALID_ONBOARDING_PERMISSION_ROLE';
    end if;
  end loop;

  delete from public.permission_role_grants
   where guild_id = p_guild_id
     and capabilities = 17179869184::bigint;

  update public.permission_role_grants
     set capabilities = capabilities & ~17179869184::bigint,
         updated_at = clock_timestamp()
   where guild_id = p_guild_id
     and (capabilities & 17179869184::bigint) <> 0;

  for v_role in
    select distinct on (value ->> 'id') value
    from jsonb_array_elements(p_roles)
    order by value ->> 'id'
  loop
    v_role_id := v_role ->> 'id';
    v_role_name := btrim(v_role ->> 'name');
    insert into public.permission_role_grants (
      guild_id,
      discord_role_id,
      discord_role_name,
      capabilities,
      granted_by_discord_id,
      notes
    ) values (
      p_guild_id,
      v_role_id,
      v_role_name,
      17179869184::bigint,
      p_actor_discord_id,
      'Selected during self-serve onboarding'
    )
    on conflict (guild_id, discord_role_id) do update
    set discord_role_name = excluded.discord_role_name,
        capabilities =
          public.permission_role_grants.capabilities |
          17179869184::bigint,
        granted_by_discord_id = excluded.granted_by_discord_id,
        updated_at = clock_timestamp(),
        notes = excluded.notes;
  end loop;

  perform public.sync_permission_role_legacy_projection(p_guild_id);
  select admin_role_ids into v_after_roles
    from public.tenants
   where id = p_guild_id;

  insert into public.admin_audit_log (
    guild_id,
    admin_discord_id,
    action,
    target_kind,
    details
  ) values (
    p_guild_id,
    p_actor_discord_id,
    'permission.role.update',
    'permission_role',
    jsonb_build_object(
      'source', 'self_serve_onboarding',
      'beforeAdminRoleIds', to_jsonb(v_before_roles),
      'afterAdminRoleIds', to_jsonb(v_after_roles),
      'afterCapabilities', 17179869184::text
    )
  );

  return jsonb_build_object(
    'changed', v_before_roles is distinct from v_after_roles,
    'adminRoleIds', to_jsonb(v_after_roles)
  );
end;
$$;

revoke all on function public.replace_onboarding_permission_admin_roles(
  uuid, jsonb, text
) from public, anon, authenticated;
grant execute on function public.replace_onboarding_permission_admin_roles(
  uuid, jsonb, text
) to service_role;

create or replace function public.apply_permission_user_override(
  p_guild_id uuid,
  p_discord_id text,
  p_capabilities_granted bigint,
  p_capabilities_revoked bigint,
  p_reason text,
  p_expires_at timestamptz,
  p_actor_discord_id text,
  p_notes text,
  p_expected_updated_at timestamptz,
  p_revoke boolean,
  p_revoke_reason text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_before public.permission_user_overrides%rowtype;
  v_after public.permission_user_overrides%rowtype;
  v_found boolean := false;
begin
  if p_guild_id is null
    or coalesce(p_discord_id, '') !~ '^[0-9]{17,20}$'
    or coalesce(p_actor_discord_id, '') !~ '^[0-9]{17,20}$'
    or p_capabilities_granted is null
    or p_capabilities_revoked is null
    or p_capabilities_granted not between 0 and 34359738367
    or p_capabilities_revoked not between 0 and 34359738367
    or (p_capabilities_granted & p_capabilities_revoked) <> 0
    or (
      (p_capabilities_granted & 17179869184::bigint) <> 0
      and p_capabilities_revoked <> 0
    )
    or char_length(btrim(coalesce(p_reason, ''))) not between 5 and 500
    or char_length(coalesce(p_notes, '')) > 500
    or p_revoke is null then
    raise exception 'INVALID_PERMISSION_OVERRIDE_INPUT';
  end if;
  if not p_revoke and (
    (p_capabilities_granted = 0 and p_capabilities_revoked = 0)
    or p_expires_at is null
    or p_expires_at < v_now + interval '15 minutes'
    or p_expires_at > v_now + interval '30 days'
  ) then
    raise exception 'INVALID_PERMISSION_OVERRIDE_LIFETIME';
  end if;
  if p_revoke
    and char_length(btrim(coalesce(p_revoke_reason, ''))) not between 5 and 500 then
    raise exception 'INVALID_PERMISSION_OVERRIDE_REVOCATION';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      p_guild_id::text || ':permission-user:' || p_discord_id,
      0
    )
  );

  select * into v_before
    from public.permission_user_overrides
   where guild_id = p_guild_id
     and discord_id = p_discord_id
   for update;
  v_found := found;

  if v_found then
    if p_expected_updated_at is null
      or v_before.updated_at is distinct from p_expected_updated_at then
      raise exception 'PERMISSION_OVERRIDE_CONFLICT';
    end if;
  elsif p_expected_updated_at is not null then
    raise exception 'PERMISSION_OVERRIDE_CONFLICT';
  end if;

  if p_revoke then
    if not v_found or v_before.revoked_at is not null then
      return jsonb_build_object('changed', false, 'revoked', true);
    end if;
    update public.permission_user_overrides
       set revoked_at = v_now,
           revoked_by_discord_id = p_actor_discord_id,
           revoked_reason = btrim(p_revoke_reason),
           updated_at = v_now
     where guild_id = p_guild_id
       and discord_id = p_discord_id
    returning * into v_after;
  else
    insert into public.permission_user_overrides (
      guild_id,
      discord_id,
      capabilities_granted,
      capabilities_revoked,
      granted_by_discord_id,
      granted_at,
      updated_at,
      notes,
      reason,
      expires_at,
      revoked_at,
      revoked_by_discord_id,
      revoked_reason
    ) values (
      p_guild_id,
      p_discord_id,
      p_capabilities_granted,
      p_capabilities_revoked,
      p_actor_discord_id,
      v_now,
      v_now,
      coalesce(p_notes, ''),
      btrim(p_reason),
      p_expires_at,
      null,
      null,
      null
    )
    on conflict (guild_id, discord_id) do update
    set capabilities_granted = excluded.capabilities_granted,
        capabilities_revoked = excluded.capabilities_revoked,
        granted_by_discord_id = excluded.granted_by_discord_id,
        granted_at = excluded.granted_at,
        updated_at = excluded.updated_at,
        notes = excluded.notes,
        reason = excluded.reason,
        expires_at = excluded.expires_at,
        revoked_at = null,
        revoked_by_discord_id = null,
        revoked_reason = null
    returning * into v_after;
  end if;

  insert into public.admin_audit_log (
    guild_id,
    admin_discord_id,
    action,
    target_id,
    target_kind,
    target_discord_id,
    details
  ) values (
    p_guild_id,
    p_actor_discord_id,
    case when p_revoke then 'permission.user.revoke' else 'permission.user.update' end,
    p_discord_id,
    'permission_user',
    p_discord_id,
    jsonb_build_object(
      'beforeGranted',
        case when v_found then v_before.capabilities_granted::text else null end,
      'beforeRevoked',
        case when v_found then v_before.capabilities_revoked::text else null end,
      'afterGranted',
        case when p_revoke then v_after.capabilities_granted::text
             else v_after.capabilities_granted::text end,
      'afterRevoked',
        case when p_revoke then v_after.capabilities_revoked::text
             else v_after.capabilities_revoked::text end,
      'reason', case when p_revoke then btrim(p_revoke_reason) else btrim(p_reason) end,
      'expiresAt', v_after.expires_at
    )
  );

  return jsonb_build_object(
    'changed', true,
    'revoked', p_revoke,
    'discordId', p_discord_id,
    'updatedAt', v_after.updated_at
  );
end;
$$;

revoke all on function public.apply_permission_user_override(
  uuid, text, bigint, bigint, text, timestamptz, text, text,
  timestamptz, boolean, text
) from public, anon, authenticated;
grant execute on function public.apply_permission_user_override(
  uuid, text, bigint, bigint, text, timestamptz, text, text,
  timestamptz, boolean, text
) to service_role;

drop trigger if exists permission_user_overrides_session_revocation
  on public.permission_user_overrides;
create trigger permission_user_overrides_session_revocation
after insert or delete or update of
  capabilities_granted,
  capabilities_revoked,
  expires_at,
  revoked_at
on public.permission_user_overrides
for each row execute function public.capture_tenant_session_revocation();

notify pgrst, 'reload schema';
