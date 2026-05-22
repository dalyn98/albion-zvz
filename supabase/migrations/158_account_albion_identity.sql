-- Site-wide Albion character claims.
--
-- This is an expand-only migration:
-- - no existing guild_avatars columns are dropped or rewritten
-- - current tenant-scoped identity remains the compatibility source
-- - new tables let one Discord account keep a site-wide Albion profile while
--   each tenant decides whether that profile is trusted for resource features

create table if not exists public.account_albion_profiles (
  id uuid primary key default gen_random_uuid(),
  discord_id text not null,

  albion_server text not null check (albion_server in ('west','east','europe')),
  albion_player_id text,
  albion_player_name text not null check (char_length(albion_player_name) between 2 and 32),

  current_guild_id text,
  current_guild_name text,
  current_alliance_id text,
  current_alliance_name text,

  is_primary boolean not null default false,
  claim_status text not null default 'claimed'
    check (claim_status in ('claimed','disputed','revoked')),
  source text not null default 'member_onboarding'
    check (source in ('member_onboarding','manual_entry','manual_refresh','cron_sync','legacy_backfill')),

  verified_at timestamptz,
  last_synced_at timestamptz,
  last_manual_sync_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_account_albion_profiles_discord
  on public.account_albion_profiles (discord_id, updated_at desc);

create index if not exists idx_account_albion_profiles_primary
  on public.account_albion_profiles (discord_id)
  where is_primary and revoked_at is null;

create index if not exists idx_account_albion_profiles_player_lookup
  on public.account_albion_profiles (albion_server, albion_player_id)
  where albion_player_id is not null and revoked_at is null;

create index if not exists idx_account_albion_profiles_sync_due
  on public.account_albion_profiles (last_synced_at nulls first, updated_at desc)
  where albion_player_id is not null and revoked_at is null;

alter table public.account_albion_profiles enable row level security;
revoke all on public.account_albion_profiles from anon, authenticated;

create table if not exists public.account_albion_tenant_links (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  discord_id text not null,
  profile_id uuid references public.account_albion_profiles(id) on delete set null,

  albion_server text not null check (albion_server in ('west','east','europe')),
  albion_player_id text,
  albion_player_name text not null check (char_length(albion_player_name) between 2 and 32),

  current_guild_id text,
  current_guild_name text,
  current_alliance_id text,
  current_alliance_name text,

  relation text not null default 'unknown'
    check (relation in ('home_guild','alliance','external','unknown')),
  trust_status text not null default 'claimed'
    check (trust_status in ('claimed','roster_matched','trusted','disputed','revoked')),
  status_reason text,

  verified_at timestamptz,
  trusted_at timestamptz,
  disputed_at timestamptz,
  revoked_at timestamptz,
  last_synced_at timestamptz,
  last_manual_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (guild_id, discord_id)
);

create index if not exists idx_account_albion_tenant_links_status
  on public.account_albion_tenant_links (guild_id, trust_status, updated_at desc);

create index if not exists idx_account_albion_tenant_links_profile
  on public.account_albion_tenant_links (profile_id)
  where profile_id is not null;

create index if not exists idx_account_albion_tenant_links_player
  on public.account_albion_tenant_links (guild_id, albion_server, albion_player_id)
  where albion_player_id is not null;

alter table public.account_albion_tenant_links enable row level security;
revoke all on public.account_albion_tenant_links from anon, authenticated;

create table if not exists public.account_albion_identity_audit (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid references public.tenants(id) on delete cascade,
  discord_id text not null,
  profile_id uuid references public.account_albion_profiles(id) on delete set null,
  actor_discord_id text,
  action text not null,
  trust_status text
    check (trust_status in ('claimed','roster_matched','trusted','disputed','revoked')),
  relation text check (relation in ('home_guild','alliance','external','unknown')),
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_account_albion_identity_audit_guild
  on public.account_albion_identity_audit (guild_id, created_at desc);

create index if not exists idx_account_albion_identity_audit_discord
  on public.account_albion_identity_audit (discord_id, created_at desc);

alter table public.account_albion_identity_audit enable row level security;
revoke all on public.account_albion_identity_audit from anon, authenticated;
