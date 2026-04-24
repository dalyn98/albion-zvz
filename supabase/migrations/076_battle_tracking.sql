-- 전투기록 자동 수집 시스템.
--
-- 설계 목적: 홈 길드가 참여한 공개 Albion 전투를 API 로 폴링해 자동 기록. 관리자가
-- 설정한 규모 필터(small/middle/large/zerg) 에 매칭되는 전투만 저장. 상대 길드가
-- 아직 앱에 가입 안 한 상태여도 raw_battle 에 정보 보존 — 나중에 그 길드가 가입하면
-- 소급 반영 가능.
--
-- 2-table 구조:
--   battle_records       — Albion 전투 1건 당 1행 (tenant 중립, 모든 서버 공유)
--   tenant_battle_records — (battle, tenant) 조합. 같은 전투를 양측 길드 모두 앱에
--                            등록했다면 2행이 생긴다 (각 tenant 시점의 W/L).
--
-- 왜 나눴나:
--   1. 같은 battle 을 양측 길드가 각자 관점으로 기록해야 "승자는 누가봐도 승, 패자는
--      패" 가 뚜렷히 드러난다.
--   2. raw_battle 을 한 번만 저장해 디스크 절약.
--   3. 새 tenant 소급 반영 시 battle_records 는 그대로 두고 tenant_battle_records
--      만 insert 하면 됨.

create table if not exists public.battle_records (
  id uuid primary key default gen_random_uuid(),
  albion_server text not null check (albion_server in ('west', 'east', 'europe')),
  -- Albion gameinfo 의 battle id (bigint). 서버별로 독립 네임스페이스라 (server, id) UNIQUE.
  albion_battle_id bigint not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  total_players integer not null check (total_players >= 0),
  total_kills integer not null check (total_kills >= 0),
  total_fame bigint not null check (total_fame >= 0),
  cluster_name text,
  -- 참여 길드/얼라이언스 UUID 를 denormalize. 후입 tenant 의 소급 반영 스캔 시
  -- array_overlap 으로 빠르게 매칭하기 위함.
  involved_guild_ids text[] not null default '{}',
  involved_alliance_ids text[] not null default '{}',
  -- 나중에 W/L 재계산이나 추가 통계 추출을 위해 원본 응답 전체 보존.
  raw_battle jsonb not null,
  created_at timestamptz not null default now(),
  unique (albion_server, albion_battle_id)
);

create index if not exists idx_battle_records_started_at
  on public.battle_records (started_at desc);

-- GIN 으로 array 매칭을 빠르게. "이 홈 길드 UUID 가 들어있는 battle 전부" 같은
-- 소급 반영 쿼리가 대표 유스케이스.
create index if not exists idx_battle_records_involved_guilds
  on public.battle_records using gin (involved_guild_ids);

create index if not exists idx_battle_records_involved_alliances
  on public.battle_records using gin (involved_alliance_ids);


create table if not exists public.tenant_battle_records (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,
  battle_record_id uuid not null references public.battle_records(id) on delete cascade,

  -- 홈 길드 관점 스냅샷. 홈 길드명/얼라이언스 변경되어도 보존.
  home_guild_id text not null,      -- Albion guild UUID
  home_guild_name text not null,
  home_alliance_id text,
  home_alliance_name text,
  home_team_size integer not null check (home_team_size >= 0),
  home_kills integer not null check (home_kills >= 0),
  home_deaths integer not null check (home_deaths >= 0),
  home_kill_fame bigint not null check (home_kill_fame >= 0),

  -- 상대측 집계. 여러 길드/얼라이언스가 섞여있을 수 있어 대표 1개 + 전체 배열 보존.
  opponent_team_size integer not null check (opponent_team_size >= 0),
  opponent_kills integer not null check (opponent_kills >= 0),
  opponent_deaths integer not null check (opponent_deaths >= 0),
  opponent_kill_fame bigint not null check (opponent_kill_fame >= 0),
  opponent_guild_names text[] not null default '{}',
  opponent_alliance_names text[] not null default '{}',
  -- 대표 상대 (리스트에서 killFame 최댓값) — 목록 UI 에 한 줄로 보여주기 위한 캐시.
  primary_opponent_name text,

  -- 규모 카테고리. small(10~30) / middle(31~60) / large(61~100) / zerg(101+).
  -- 양측 모두 같은 카테고리일 때만 insert 된다 (cron 에서 필터).
  size_category text not null check (size_category in ('small', 'middle', 'large', 'zerg')),

  -- 승패 판정. 'fame_diff' 방식: home_kill_fame > opponent_kill_fame = win, 반대는 loss, 같으면 tie.
  outcome text not null check (outcome in ('win', 'loss', 'tie')),
  outcome_method text not null default 'fame_diff',

  -- 빠른 정렬/필터용 denormalize. battle_records.started_at 와 동일 값 복사.
  started_at timestamptz not null,

  created_at timestamptz not null default now(),

  -- 같은 tenant 가 같은 battle 을 두 번 가지지 않도록.
  unique (guild_id, battle_record_id)
);

create index if not exists idx_tenant_battle_records_guild_time
  on public.tenant_battle_records (guild_id, started_at desc);

create index if not exists idx_tenant_battle_records_outcome
  on public.tenant_battle_records (guild_id, outcome);


-- 설정값은 기존 app_settings (guild_id, key) 복합키 테이블에 저장한다. 마이그는
-- 컬럼/테이블 추가 없음 — 런타임에 읽고 쓸 key 만 여기 문서화:
--   key='battle_tracking_enabled'  value=jsonb bool        ex) true
--   key='battle_tracking_sizes'    value=jsonb text[]       ex) ["small","middle"]
--
-- 기본값: enabled=false, sizes=[] (명시적으로 켜야 cron 이 해당 tenant 를 처리).

comment on table public.battle_records is
  'Albion 공개 전투 API 폴링 결과. tenant 중립 — 한 battle 에 대해 1행. (server, albion_battle_id) UNIQUE 로 dedupe.';
comment on table public.tenant_battle_records is
  '각 tenant 가 관찰한 전투 기록. battle_records 와 N:1 (같은 battle 을 양측 tenant 가 모두 등록한 경우 2행). 홈 길드 관점 승/패 + 규모 카테고리 포함.';
