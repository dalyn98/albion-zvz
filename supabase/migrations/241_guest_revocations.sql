-- Durable guest revocations.
--
-- Deleting public.guests alone is not enough when an event guest invite token
-- is still active: the same Discord user can use the reusable token again and
-- recreate the row. Keep a tenant-scoped deny row so admin revocation survives
-- guest re-login attempts.

create table if not exists public.guest_revocations (
  guild_id uuid not null references public.tenants(id) on delete cascade,
  discord_id text not null,
  revoked_at timestamptz not null default now(),
  revoked_by text,
  revoked_by_username text,
  primary key (guild_id, discord_id)
);

create index if not exists guest_revocations_revoked_at_idx
  on public.guest_revocations (revoked_at desc);

alter table public.guest_revocations enable row level security;
