-- 187: Lightweight battle force model.
--
-- Purpose:
--   battle_records remains the global raw Albion battle source of truth.
--   tenant_battle_records remains the per-tenant view/list row.
--   These two tables add a shared, low-write cache for:
--     1) who participated as a guild/alliance force;
--     2) which forces have direct killboard evidence of fighting each other.
--
-- This intentionally does not store per-player snapshots. Player K/D is read from
-- battle_records.raw_battle.players, and weapon/IP is enriched from killboard_events
-- or raw_battle when present.

create table if not exists public.battle_force_summaries (
  battle_record_id uuid not null references public.battle_records(id) on delete cascade,
  force_level text not null check (force_level in ('alliance', 'guild')),
  force_kind text not null check (force_kind in ('alliance', 'guild')),
  force_key text not null,
  force_name text not null,
  alliance_id text,
  alliance_name text,
  guild_ids text[] not null default '{}',
  guild_names text[] not null default '{}',
  team_size integer not null check (team_size >= 0),
  kills integer not null check (kills >= 0),
  deaths integer not null check (deaths >= 0),
  kill_fame bigint not null check (kill_fame >= 0),
  average_item_power integer,
  updated_at timestamptz not null default now(),
  primary key (battle_record_id, force_level, force_key)
);

create index if not exists idx_battle_force_summaries_battle_level
  on public.battle_force_summaries (battle_record_id, force_level, team_size desc);

create table if not exists public.battle_force_edges (
  battle_record_id uuid not null references public.battle_records(id) on delete cascade,
  force_level text not null check (force_level in ('alliance', 'guild')),
  force_a_key text not null,
  force_a_kind text not null check (force_a_kind in ('alliance', 'guild')),
  force_a_name text not null,
  force_a_team_size integer not null check (force_a_team_size >= 0),
  force_b_key text not null,
  force_b_kind text not null check (force_b_kind in ('alliance', 'guild')),
  force_b_name text not null,
  force_b_team_size integer not null check (force_b_team_size >= 0),
  a_kills integer not null default 0 check (a_kills >= 0),
  a_deaths integer not null default 0 check (a_deaths >= 0),
  a_kill_fame bigint not null default 0 check (a_kill_fame >= 0),
  b_kills integer not null default 0 check (b_kills >= 0),
  b_deaths integer not null default 0 check (b_deaths >= 0),
  b_kill_fame bigint not null default 0 check (b_kill_fame >= 0),
  event_count integer not null default 0 check (event_count >= 0),
  is_meaningful boolean not null default false,
  confidence text not null default 'weak' check (confidence in ('killboard_exact', 'weak')),
  evidence_source text not null default 'killboard_events' check (evidence_source in ('killboard_events')),
  evaluated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (battle_record_id, force_level, force_a_key, force_b_key),
  check (force_a_key < force_b_key)
);

create index if not exists idx_battle_force_edges_meaningful
  on public.battle_force_edges (battle_record_id, force_level, event_count desc)
  where is_meaningful = true;

alter table public.battle_force_summaries enable row level security;
alter table public.battle_force_edges enable row level security;

revoke all on public.battle_force_summaries from anon, authenticated;
revoke all on public.battle_force_edges from anon, authenticated;

comment on table public.battle_force_summaries is
  'Shared force summaries per Albion battle. force_level=guild stores each guild; force_level=alliance stores alliance forces plus standalone guild forces. No per-player snapshots.';

comment on table public.battle_force_edges is
  'Shared direct engagement edges between battle forces, deduped from killboard event evidence. is_meaningful requires both forces to meet the battle size floor.';
