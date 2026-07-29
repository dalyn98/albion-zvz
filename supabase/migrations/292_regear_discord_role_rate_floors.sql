-- 292: Tenant-scoped Discord role minimum payout rates.
--
-- A configured role rate is a floor only. The effective payout rate is resolved
-- in application code as max(base rate, video rate when applicable, matched role floor).

create table if not exists public.regear_discord_role_rate_floors (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  discord_role_id text not null,
  discord_role_name text not null,
  minimum_payout_rate_percent integer not null,
  updated_by text,
  updated_at timestamptz not null default now(),
  constraint regear_discord_role_rate_floors_role_id_chk
    check (discord_role_id ~ '^[0-9]{5,30}$'),
  constraint regear_discord_role_rate_floors_role_name_chk
    check (length(btrim(discord_role_name)) > 0 and length(discord_role_name) <= 100),
  constraint regear_discord_role_rate_floors_rate_chk
    check (minimum_payout_rate_percent >= 1 and minimum_payout_rate_percent <= 1000),
  constraint regear_discord_role_rate_floors_unique_role
    unique (guild_id, discord_role_id)
);

create index if not exists regear_discord_role_rate_floors_rate_idx
  on public.regear_discord_role_rate_floors
  (guild_id, minimum_payout_rate_percent desc);

alter table public.regear_discord_role_rate_floors enable row level security;

grant select, insert, update, delete
  on public.regear_discord_role_rate_floors
  to service_role;

comment on table public.regear_discord_role_rate_floors is
  'Per-tenant Discord role minimum regear payout rates. Presence of at least one row enables max(base, video, matched role floor) resolution for the tenant.';
comment on column public.regear_discord_role_rate_floors.minimum_payout_rate_percent is
  'Minimum payout rate for members with this Discord role. Highest matching rate wins.';
