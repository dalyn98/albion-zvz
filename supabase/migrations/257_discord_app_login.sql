-- Discord interaction-authenticated, one-time browser handoff links.
-- The raw token is intentionally never persisted; it may appear in a URL,
-- so only its SHA-256 representation is retained server-side.

create table if not exists public.discord_app_login_attempts (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  discord_id text not null check (char_length(discord_id) between 1 and 128),
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  return_to text not null default '/',
  expires_at timestamptz not null default (clock_timestamp() + interval '5 minutes'),
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check (expires_at > created_at)
);

alter table public.discord_app_login_attempts enable row level security;
revoke all on public.discord_app_login_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.discord_app_login_attempts to service_role;
