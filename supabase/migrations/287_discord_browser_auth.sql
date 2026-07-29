-- Browser-bound Discord app approval for arbitrary shared tenant URLs.
-- The browser secret and human-readable approval code are never stored raw.
-- All access stays behind the service role; signed Discord interactions are
-- the only approval authority.

create table if not exists public.discord_browser_auth_attempts (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  code_hash text not null check (code_hash ~ '^[a-f0-9]{64}$'),
  browser_secret_hash text not null check (browser_secret_hash ~ '^[a-f0-9]{64}$'),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  return_to text not null default '/',
  approved_discord_id text check (
    approved_discord_id is null
    or char_length(approved_discord_id) between 5 and 30
  ),
  approved_at timestamptz,
  consumed_at timestamptz,
  expires_at timestamptz not null default (clock_timestamp() + interval '5 minutes'),
  created_at timestamptz not null default clock_timestamp(),
  check (expires_at > created_at),
  check (
    (approved_discord_id is null and approved_at is null)
    or (approved_discord_id is not null and approved_at is not null)
  ),
  unique (guild_id, code_hash)
);

create index if not exists discord_browser_auth_attempts_fingerprint_created_idx
  on public.discord_browser_auth_attempts (guild_id, request_fingerprint, created_at desc);
create index if not exists discord_browser_auth_attempts_expires_idx
  on public.discord_browser_auth_attempts (expires_at);

alter table public.discord_browser_auth_attempts enable row level security;
revoke all on public.discord_browser_auth_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.discord_browser_auth_attempts to service_role;

create or replace function public.create_discord_browser_auth_attempt(
  p_guild_id uuid,
  p_code_hash text,
  p_browser_secret_hash text,
  p_request_fingerprint text,
  p_return_to text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_id uuid;
  v_recent_count integer;
begin
  if p_guild_id is null
    or coalesce(p_code_hash, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_browser_secret_hash, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_request_fingerprint, '') !~ '^[a-f0-9]{64}$'
    or char_length(coalesce(p_return_to, '')) not between 1 and 2048 then
    raise exception 'INVALID_DISCORD_BROWSER_AUTH_INPUT';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_guild_id::text || ':' || p_request_fingerprint, 0)
  );

  delete from public.discord_browser_auth_attempts
   where guild_id = p_guild_id
     and expires_at < v_now - interval '1 hour';

  select count(*) into v_recent_count
    from public.discord_browser_auth_attempts
   where guild_id = p_guild_id
     and request_fingerprint = p_request_fingerprint
     and created_at > v_now - interval '15 minutes';

  if v_recent_count >= 12 then
    return jsonb_build_object('allowed', false, 'retry_after_seconds', 900);
  end if;

  insert into public.discord_browser_auth_attempts (
    guild_id,
    code_hash,
    browser_secret_hash,
    request_fingerprint,
    return_to,
    expires_at
  ) values (
    p_guild_id,
    p_code_hash,
    p_browser_secret_hash,
    p_request_fingerprint,
    p_return_to,
    v_now + interval '5 minutes'
  )
  returning id into v_id;

  return jsonb_build_object(
    'allowed', true,
    'attempt_id', v_id,
    'expires_in_seconds', 300
  );
end;
$$;

revoke all on function public.create_discord_browser_auth_attempt(
  uuid, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_discord_browser_auth_attempt(
  uuid, text, text, text, text
) to service_role;

create or replace function public.approve_discord_browser_auth_attempt(
  p_guild_id uuid,
  p_code_hash text,
  p_discord_id text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_updated integer;
begin
  if p_guild_id is null
    or coalesce(p_code_hash, '') !~ '^[a-f0-9]{64}$'
    or coalesce(p_discord_id, '') !~ '^[0-9]{5,30}$' then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_code_hash, 0));

  update public.discord_browser_auth_attempts
     set approved_discord_id = p_discord_id,
         approved_at = v_now
   where guild_id = p_guild_id
     and code_hash = p_code_hash
     and approved_at is null
     and consumed_at is null
     and expires_at > v_now;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.approve_discord_browser_auth_attempt(
  uuid, text, text
) from public, anon, authenticated;
grant execute on function public.approve_discord_browser_auth_attempt(
  uuid, text, text
) to service_role;
