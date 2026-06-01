-- 공적 전투 원장 shadow 모델.
--
-- 목적:
--   기존 /battles read path 는 그대로 두고, Albion API 원본을 전역 원장 관점으로
--   재해석할 수 있는 registry / participant / guild view projection 을 병행 적재한다.
--   이 테이블들은 1차 shadow 검증용이며 기존 tenant_battle_records 를 대체하지 않는다.
--
-- 원칙:
--   - battle_records.raw_battle 이 원본 source of truth.
--   - 원본은 사용자/관리자가 수정하지 않는다.
--   - low-engagement/small 컷은 row 삭제가 아니라 projection policy 로 표시한다.
--   - 길드/연합/플레이어 관계 키는 albion_server + entity_type + albion_id.

create table if not exists public.albion_registry_entities (
  id uuid primary key default gen_random_uuid(),
  albion_server text not null check (albion_server in ('west', 'east', 'europe')),
  entity_type text not null check (entity_type in ('guild', 'alliance', 'player')),
  albion_id text not null,
  current_name text not null,
  current_tag text,
  source text not null default 'battle_snapshot' check (source in ('battle_snapshot', 'guild_sync')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (albion_server, entity_type, albion_id)
);

create index if not exists idx_albion_registry_entities_name
  on public.albion_registry_entities (albion_server, entity_type, current_name);

create table if not exists public.albion_registry_entity_names (
  albion_server text not null check (albion_server in ('west', 'east', 'europe')),
  entity_type text not null check (entity_type in ('guild', 'alliance', 'player')),
  albion_id text not null,
  name text not null,
  tag text,
  source text not null default 'battle_snapshot' check (source in ('battle_snapshot', 'guild_sync')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (albion_server, entity_type, albion_id, name)
);

create index if not exists idx_albion_registry_entity_names_lookup
  on public.albion_registry_entity_names (albion_server, entity_type, name);

create table if not exists public.battle_record_snapshots (
  battle_record_id uuid not null references public.battle_records(id) on delete cascade,
  raw_hash text not null,
  fetched_at timestamptz not null default now(),
  summary jsonb not null,
  created_at timestamptz not null default now(),
  primary key (battle_record_id, raw_hash),
  check (raw_hash ~ '^[a-f0-9]{64}$')
);

create index if not exists idx_battle_record_snapshots_fetched_at
  on public.battle_record_snapshots (fetched_at desc);

create table if not exists public.battle_participant_snapshots (
  battle_record_id uuid not null references public.battle_records(id) on delete cascade,
  participant_type text not null check (participant_type in ('guild', 'alliance', 'player')),
  entity_albion_id text not null,
  entity_name text not null,
  guild_albion_id text,
  guild_name text,
  alliance_albion_id text,
  alliance_name text,
  team_size integer not null default 0 check (team_size >= 0),
  kills integer not null default 0 check (kills >= 0),
  deaths integer not null default 0 check (deaths >= 0),
  kill_fame bigint not null default 0 check (kill_fame >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (battle_record_id, participant_type, entity_albion_id)
);

create index if not exists idx_battle_participant_snapshots_entity
  on public.battle_participant_snapshots (participant_type, entity_albion_id);

create index if not exists idx_battle_participant_snapshots_guild
  on public.battle_participant_snapshots (guild_albion_id, battle_record_id)
  where guild_albion_id is not null;

create index if not exists idx_battle_participant_snapshots_alliance
  on public.battle_participant_snapshots (alliance_albion_id, battle_record_id)
  where alliance_albion_id is not null;

create table if not exists public.battle_view_projections (
  id uuid primary key default gen_random_uuid(),
  battle_record_id uuid not null references public.battle_records(id) on delete cascade,
  subject_type text not null check (subject_type in ('guild')),
  subject_albion_id text not null,
  subject_name text not null,
  subject_alliance_id text,
  subject_alliance_name text,
  relation_scope text not null check (relation_scope in ('direct', 'alliance')),
  opponent_force_key text not null,
  opponent_force_kind text not null check (opponent_force_kind in ('guild', 'alliance')),
  opponent_force_albion_id text not null,
  opponent_force_name text not null,
  opponent_alliance_id text,
  subject_team_size integer not null check (subject_team_size >= 0),
  subject_kills integer not null default 0 check (subject_kills >= 0),
  subject_deaths integer not null default 0 check (subject_deaths >= 0),
  subject_kill_fame bigint not null default 0 check (subject_kill_fame >= 0),
  opponent_team_size integer not null check (opponent_team_size >= 0),
  opponent_kills integer not null default 0 check (opponent_kills >= 0),
  opponent_deaths integer not null default 0 check (opponent_deaths >= 0),
  opponent_kill_fame bigint not null default 0 check (opponent_kill_fame >= 0),
  status text not null check (status in ('provisional', 'final', 'low_confidence')),
  evidence_source text not null check (evidence_source in ('battle_summary', 'killboard_events')),
  is_meaningful boolean not null default false,
  view_policy text not null check (view_policy in ('default_meaningful', 'small_or_low_engagement')),
  result_estimate text not null check (result_estimate in ('advantage', 'disadvantage', 'even', 'unclear')),
  size_category text check (size_category in ('small', 'middle', 'large', 'zerg')),
  legacy_outcome text check (legacy_outcome in ('win', 'loss', 'tie')),
  evaluated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (
    battle_record_id,
    subject_type,
    subject_albion_id,
    relation_scope,
    opponent_force_key
  )
);

create index if not exists idx_battle_view_projections_subject_time
  on public.battle_view_projections (subject_type, subject_albion_id, evaluated_at desc);

create index if not exists idx_battle_view_projections_meaningful
  on public.battle_view_projections (subject_type, subject_albion_id, evaluated_at desc)
  where is_meaningful = true;

create table if not exists public.battle_projection_diffs (
  id uuid primary key default gen_random_uuid(),
  battle_record_id uuid not null references public.battle_records(id) on delete cascade,
  legacy_tenant_id uuid references public.tenants(id) on delete cascade,
  legacy_tenant_battle_record_id uuid references public.tenant_battle_records(id) on delete cascade,
  subject_type text not null check (subject_type in ('guild')),
  subject_albion_id text not null,
  diff_type text not null check (
    diff_type in (
      'missing_shadow_projection',
      'missing_legacy_projection',
      'opponent_mismatch',
      'meaningful_policy_mismatch',
      'result_estimate_mismatch'
    )
  ),
  legacy_payload jsonb not null default '{}'::jsonb,
  shadow_payload jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists idx_battle_projection_diffs_unresolved
  on public.battle_projection_diffs (detected_at desc)
  where resolved_at is null;

create unique index if not exists idx_battle_projection_diffs_legacy_unique
  on public.battle_projection_diffs (
    battle_record_id,
    subject_type,
    subject_albion_id,
    diff_type,
    legacy_tenant_battle_record_id
  )
  where legacy_tenant_battle_record_id is not null;

create unique index if not exists idx_battle_projection_diffs_missing_unique
  on public.battle_projection_diffs (
    battle_record_id,
    subject_type,
    subject_albion_id,
    diff_type
  )
  where legacy_tenant_battle_record_id is null;

comment on table public.albion_registry_entities is
  'Albion API 에 등장한 guild/alliance/player registry. 내부 관계 키는 (server,type,albion_id), 이름은 현재 표시용.';
comment on table public.albion_registry_entity_names is
  '전투 snapshot 또는 guild sync 에서 관측한 이름 이력. 같은 서버 내 이름 유니크 도메인을 검색 UX 에 활용한다.';
comment on table public.battle_record_snapshots is
  'battle_records.raw_battle 의 수집 이력 요약. raw_hash 로 원본 변화 여부를 추적한다.';
comment on table public.battle_participant_snapshots is
  '전투 당시 guild/alliance/player participant snapshot. 현재 이름/소속으로 덮어쓰지 않는다.';
comment on table public.battle_view_projections is
  '길드 페이지용 shadow projection. 직접 참여와 전투 당시 연합 참여를 relation_scope 로 구분한다.';
comment on table public.battle_projection_diffs is
  '기존 tenant_battle_records 와 새 projection 의 shadow 검증 차이. read path 전환 전 검토용.';
