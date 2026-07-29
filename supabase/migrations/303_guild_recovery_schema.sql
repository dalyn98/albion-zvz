-- 303: Same-guild operational recovery receipts.
--
-- Recovery is intentionally narrower than a full database backup. A durable
-- server-side snapshot is stored immediately before the atomic restore command
-- changes balances, inventory, reservations, escrows, or open obligations.

create table if not exists public.guild_recovery_identities (
  guild_id uuid primary key references public.tenants(id) on delete cascade,
  albion_guild_id text not null check (length(btrim(albion_guild_id)) > 0),
  established_at timestamptz not null default now(),
  unique (guild_id, albion_guild_id)
);

insert into public.guild_recovery_identities (guild_id, albion_guild_id)
select setting.guild_id, btrim(setting.value)
  from public.app_settings as setting
 where setting.key = 'albion_home_guild_id'
   and length(btrim(setting.value)) > 0
on conflict (guild_id) do nothing;

comment on table public.guild_recovery_identities is
  'Immutable per-workspace Albion guild identity established when recovery support is first used.';

alter table public.guild_recovery_identities enable row level security;

revoke all on public.guild_recovery_identities
  from public, anon, authenticated;
grant select, insert on public.guild_recovery_identities to service_role;

create table if not exists public.guild_recovery_exports (
  backup_id uuid primary key,
  guild_id uuid not null references public.tenants(id) on delete cascade,
  source_albion_guild_id text not null,
  schema_version integer not null check (schema_version = 2),
  manifest_sha256 text not null
    check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  source_created_at timestamptz not null,
  registered_at timestamptz not null default now(),
  foreign key (guild_id, source_albion_guild_id)
    references public.guild_recovery_identities (guild_id, albion_guild_id),
  unique (guild_id, backup_id, manifest_sha256)
);

create index if not exists guild_recovery_exports_guild_created_idx
  on public.guild_recovery_exports (guild_id, source_created_at desc);

comment on table public.guild_recovery_exports is
  'Server-issued recovery manifest registry. Preview/apply reject edited source metadata or manifests not issued for the target workspace.';

alter table public.guild_recovery_exports enable row level security;

revoke all on public.guild_recovery_exports from public, anon, authenticated;
grant select, insert on public.guild_recovery_exports to service_role;

create table if not exists public.guild_recovery_runs (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  idempotency_key uuid not null,
  backup_id uuid not null,
  source_workspace_id uuid not null check (source_workspace_id = guild_id),
  source_albion_guild_id text not null,
  source_guild_name text,
  source_created_at timestamptz not null,
  schema_version integer not null check (schema_version > 0),
  manifest_sha256 text not null
    check (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  actor_discord_id text not null,
  actor_username text,
  status text not null default 'succeeded'
    check (status = 'succeeded'),
  safety_snapshot jsonb not null,
  before_summary jsonb not null,
  after_summary jsonb not null,
  restore_diff jsonb not null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (guild_id, source_albion_guild_id)
    references public.guild_recovery_identities (guild_id, albion_guild_id),
  foreign key (guild_id, backup_id, manifest_sha256)
    references public.guild_recovery_exports (
      guild_id,
      backup_id,
      manifest_sha256
    ),
  unique (guild_id, idempotency_key)
);

create index if not exists guild_recovery_runs_guild_completed_idx
  on public.guild_recovery_runs (guild_id, completed_at desc);

create index if not exists guild_recovery_runs_backup_idx
  on public.guild_recovery_runs (guild_id, backup_id, completed_at desc);

comment on table public.guild_recovery_runs is
  'Successful same-workspace recovery receipts. safety_snapshot is generated server-side before mutation and is never a browser-download acknowledgement.';

alter table public.guild_recovery_runs enable row level security;

revoke all on public.guild_recovery_runs from public, anon, authenticated;
grant select, insert on public.guild_recovery_runs to service_role;
