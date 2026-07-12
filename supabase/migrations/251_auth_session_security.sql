-- P0 authentication hardening. Local-account throttling is tenant-scoped and
-- durable across Vercel instances; raw IP addresses never enter the database.
-- Session revocations are checked server-side on every request, so a role or
-- membership transition no longer leaves a signed capability snapshot valid
-- for its full cookie lifetime.

create table if not exists public.local_guild_auth_attempts (
  guild_id uuid not null references public.tenants(id) on delete cascade,
  scope text not null check (scope in ('login', 'registration')),
  subject text not null check (char_length(subject) between 1 and 160),
  ip_hash text not null check (ip_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 0 check (attempts >= 0),
  locked_until timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (guild_id, scope, subject, ip_hash)
);

alter table public.local_guild_auth_attempts enable row level security;
revoke all on public.local_guild_auth_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.local_guild_auth_attempts to service_role;

create or replace function public.consume_local_guild_auth_attempt(
  p_guild_id uuid,
  p_scope text,
  p_subject text,
  p_ip_hash text,
  p_max_attempts integer,
  p_window_seconds integer,
  p_lock_seconds integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.local_guild_auth_attempts%rowtype;
  v_retry integer := 0;
begin
  if p_guild_id is null
    or p_scope not in ('login', 'registration')
    or char_length(coalesce(p_subject, '')) not between 1 and 160
    or coalesce(p_ip_hash, '') !~ '^[a-f0-9]{64}$'
    or p_max_attempts not between 1 and 20
    or p_window_seconds not between 60 and 3600
    or p_lock_seconds not between 60 and 86400 then
    raise exception 'INVALID_AUTH_RATE_LIMIT_INPUT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':' || p_scope || ':' || p_subject || ':' || p_ip_hash, 0)
  );

  select * into v_row
    from public.local_guild_auth_attempts
   where guild_id = p_guild_id
     and scope = p_scope
     and subject = p_subject
     and ip_hash = p_ip_hash
   for update;

  if not found then
    insert into public.local_guild_auth_attempts (
      guild_id, scope, subject, ip_hash, window_started_at, attempts, updated_at
    ) values (
      p_guild_id, p_scope, p_subject, p_ip_hash, v_now, 1, v_now
    );
    return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  end if;

  if v_row.locked_until is not null and v_row.locked_until > v_now then
    v_retry := greatest(1, ceil(extract(epoch from v_row.locked_until - v_now))::integer);
    return jsonb_build_object('allowed', false, 'retry_after_seconds', v_retry);
  end if;

  if v_row.window_started_at <= v_now - make_interval(secs => p_window_seconds) then
    update public.local_guild_auth_attempts
       set window_started_at = v_now,
           attempts = 1,
           locked_until = null,
           updated_at = v_now
     where guild_id = p_guild_id
       and scope = p_scope
       and subject = p_subject
       and ip_hash = p_ip_hash;
    return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
  end if;

  if v_row.attempts >= p_max_attempts then
    update public.local_guild_auth_attempts
       set attempts = v_row.attempts + 1,
           locked_until = v_now + make_interval(secs => p_lock_seconds),
           updated_at = v_now
     where guild_id = p_guild_id
       and scope = p_scope
       and subject = p_subject
       and ip_hash = p_ip_hash;
    return jsonb_build_object('allowed', false, 'retry_after_seconds', p_lock_seconds);
  end if;

  update public.local_guild_auth_attempts
     set attempts = v_row.attempts + 1,
         updated_at = v_now
   where guild_id = p_guild_id
     and scope = p_scope
     and subject = p_subject
     and ip_hash = p_ip_hash;
  return jsonb_build_object('allowed', true, 'retry_after_seconds', 0);
end;
$$;

revoke all on function public.consume_local_guild_auth_attempt(uuid, text, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_local_guild_auth_attempt(uuid, text, text, text, integer, integer, integer) to service_role;

create table if not exists public.tenant_session_revocations (
  guild_id uuid not null references public.tenants(id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 128),
  invalid_before timestamptz not null default clock_timestamp(),
  primary key (guild_id, subject)
);

alter table public.tenant_session_revocations enable row level security;
revoke all on public.tenant_session_revocations from public, anon, authenticated;
grant select, insert, update, delete on public.tenant_session_revocations to service_role;

create or replace function public.revoke_tenant_session(
  p_guild_id uuid,
  p_subject text default '*'
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_subject text := coalesce(nullif(p_subject, ''), '*');
begin
  if p_guild_id is null or char_length(v_subject) > 128 then
    raise exception 'INVALID_SESSION_REVOCATION_INPUT';
  end if;
  insert into public.tenant_session_revocations (guild_id, subject, invalid_before)
  values (p_guild_id, v_subject, v_now)
  on conflict (guild_id, subject)
  do update set invalid_before = excluded.invalid_before;
  return v_now;
end;
$$;

revoke all on function public.revoke_tenant_session(uuid, text) from public, anon, authenticated;
grant execute on function public.revoke_tenant_session(uuid, text) to service_role;

create or replace function public.capture_tenant_session_revocation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guild_id uuid;
  v_subject text := '*';
  v_key text;
begin
  if tg_table_name = 'tenant_admin_overrides' then
    if tg_op = 'DELETE' then v_guild_id := old.tenant_id; else v_guild_id := new.tenant_id; end if;
  elsif tg_table_name = 'permission_role_grants' then
    if tg_op = 'DELETE' then v_guild_id := old.guild_id; else v_guild_id := new.guild_id; end if;
  elsif tg_table_name = 'permission_user_overrides' then
    if tg_op = 'DELETE' then
      v_guild_id := old.guild_id;
      v_subject := old.discord_id;
    else
      v_guild_id := new.guild_id;
      v_subject := new.discord_id;
    end if;
  elsif tg_table_name = 'tenants' then
    v_guild_id := new.id;
  elsif tg_table_name = 'app_settings' then
    if tg_op = 'DELETE' then v_key := old.key; else v_key := new.key; end if;
    if v_key not in (
      'active_member_role_ids',
      'bomb_squad_caller_role_ids',
      'event_creator_role_ids',
      'event_creator_role_ids_combat',
      'event_creator_role_ids_ff',
      'event_creator_role_ids_ganking'
    ) then
      if tg_op = 'DELETE' then return old; end if;
      return new;
    end if;
    if tg_op = 'DELETE' then v_guild_id := old.guild_id; else v_guild_id := new.guild_id; end if;
  elsif tg_table_name = 'guild_avatars' then
    if tg_op = 'DELETE' then
      v_guild_id := old.guild_id;
      v_subject := old.discord_id;
    else
      v_guild_id := new.guild_id;
      v_subject := new.discord_id;
    end if;
  elsif tg_table_name = 'guild_local_accounts' then
    if tg_op = 'DELETE' then
      v_guild_id := old.guild_id;
      v_subject := old.subject;
    else
      v_guild_id := new.guild_id;
      v_subject := new.subject;
    end if;
  elsif tg_table_name = 'guest_revocations' then
    if tg_op = 'DELETE' then
      v_guild_id := old.guild_id;
      v_subject := old.discord_id;
    else
      v_guild_id := new.guild_id;
      v_subject := new.discord_id;
    end if;
  else
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if v_guild_id is not null and char_length(coalesce(v_subject, '')) between 1 and 128 then
    perform public.revoke_tenant_session(v_guild_id, v_subject);
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.capture_tenant_session_revocation() from public, anon, authenticated;
grant execute on function public.capture_tenant_session_revocation() to service_role;

drop trigger if exists tenant_admin_overrides_session_revocation on public.tenant_admin_overrides;
create trigger tenant_admin_overrides_session_revocation
after insert or update or delete on public.tenant_admin_overrides
for each row execute function public.capture_tenant_session_revocation();

drop trigger if exists permission_role_grants_session_revocation on public.permission_role_grants;
create trigger permission_role_grants_session_revocation
after insert or delete or update of capabilities, discord_role_id on public.permission_role_grants
for each row execute function public.capture_tenant_session_revocation();

drop trigger if exists permission_user_overrides_session_revocation on public.permission_user_overrides;
create trigger permission_user_overrides_session_revocation
after insert or delete or update of capabilities_granted, capabilities_revoked on public.permission_user_overrides
for each row execute function public.capture_tenant_session_revocation();

drop trigger if exists tenants_session_revocation on public.tenants;
create trigger tenants_session_revocation
after update of admin_role_ids, member_role_ids on public.tenants
for each row execute function public.capture_tenant_session_revocation();

drop trigger if exists app_settings_session_revocation on public.app_settings;
create trigger app_settings_session_revocation
after insert or update of value or delete on public.app_settings
for each row execute function public.capture_tenant_session_revocation();

drop trigger if exists guild_avatars_session_revocation on public.guild_avatars;
create trigger guild_avatars_session_revocation
after update of withdrawn_at, is_admin, is_bomb_squad_caller or delete on public.guild_avatars
for each row execute function public.capture_tenant_session_revocation();

drop trigger if exists guild_local_accounts_session_revocation on public.guild_local_accounts;
create trigger guild_local_accounts_session_revocation
after update of revoked_at, password_hash, trust_status or delete on public.guild_local_accounts
for each row execute function public.capture_tenant_session_revocation();

drop trigger if exists guest_revocations_session_revocation on public.guest_revocations;
create trigger guest_revocations_session_revocation
after insert or update or delete on public.guest_revocations
for each row execute function public.capture_tenant_session_revocation();

notify pgrst, 'reload schema';
