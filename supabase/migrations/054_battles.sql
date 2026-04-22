-- 킬로그 기반 배틀 기록. 이전 `event_battles` (migration 023, 045 에서 drop)
-- 가 관리자 수동 입력이었던 반면, 이번엔 `/events` 킬보드 전수 스냅샷에서
-- 자동 집계한다.
--
-- 흐름:
--   1. 이벤트의 battle_started_at 이 세팅되면 active 윈도우가 시작.
--   2. `/api/cron/killboard-sync` 가 5분 주기로 돌 때 active 이벤트가 있으면
--      전역 `/events` 엔드포인트도 폴링 → battle_kill_snapshots 에 append.
--   3. 윈도우 종료 (battle_started_at + window_hours) 후 `/api/cron/
--      battle-aggregate` 가 미확정 이벤트를 찾아 집계:
--       - 스냅샷의 모든 킬에서 참여 길드/선수 enumerate
--       - 총 플레이어 수 < min_total_players → excluded
--       - 길드별 선수 수 < min_guild_players → ineligible
--       - 그 외 길드만 명성차 순으로 winner/loser/draw 배정.
--   4. `/events/[id]` 페이지가 `battles + battle_participants` 를 읽어 결과
--      카드 렌더.
--
-- SaaS 확장 대비: `event_id` 를 FK 로 묶어 tenant-agnostic 하게 유지 — 길드별
-- 도메인이 각자 자기 events 에 붙어있기만 하면 된다.

create table if not exists public.battles (
  id                   uuid        primary key default gen_random_uuid(),
  event_id             uuid        not null references public.events(id) on delete cascade,
  window_start         timestamptz not null,
  window_end           timestamptz not null,
  total_players        integer     not null default 0,
  -- 'pending' 는 윈도우 미종료/집계 대기, 'win'/'loss'/'draw' 는 자기 길드 기준,
  -- 'excluded' 는 최소 플레이어 미달. 추후 'error' 를 쓸 수 있도록 text.
  outcome              text        not null default 'pending'
                         check (outcome in ('pending','win','loss','draw','excluded','error')),
  exclude_reason       text,
  snapshot_fetched_at  timestamptz,
  aggregated_at        timestamptz,
  created_at           timestamptz not null default now(),
  -- 이벤트 1개 = 배틀 1개. 재집계는 UPDATE (아래 aggregated_at 갱신).
  unique (event_id)
);

create index if not exists idx_battles_window_end
  on public.battles (window_end);

-- 배틀에 참여한 길드별 집계. is_own_guild 는 집계 시점의 ALBION_GUILD_NAME
-- 과 일치 여부 — 훗날 SaaS 로 가면 이 플래그는 tenant 맥락으로 계산된다.
create table if not exists public.battle_participants (
  battle_id       uuid    not null references public.battles(id) on delete cascade,
  guild_name      text    not null,
  player_count    integer not null default 0,
  kills           integer not null default 0,
  deaths          integer not null default 0,
  fame_gained     bigint  not null default 0,
  fame_lost       bigint  not null default 0,
  fame_delta      bigint  generated always as (fame_gained - fame_lost) stored,
  is_own_guild    boolean not null default false,
  -- 'winner'|'loser'|'draw' 는 집계 성공 후 할당, 'ineligible' 은 길드 최소
  -- 인원 미달(= 승패 판정 제외). null 은 집계 진행 중 상태 포함.
  outcome_role    text
                  check (outcome_role in ('winner','loser','draw','ineligible')),
  primary key (battle_id, guild_name)
);

create index if not exists idx_battle_participants_battle
  on public.battle_participants (battle_id);

-- 서버 전체 `/events` 스냅샷 raw. battle 당 수백~수천 건이 될 수 있어 별도
-- 테이블로 분리. 같은 event_id 가 여러 battle 에 걸릴 수는 없지만, 재집계
-- 안전을 위해 (battle_id, event_id) 를 PK 로.
create table if not exists public.battle_kill_snapshots (
  battle_id      uuid    not null references public.battles(id) on delete cascade,
  event_id       bigint  not null,
  occurred_at    timestamptz not null,
  killer_name    text,
  killer_guild   text,
  victim_name    text,
  victim_guild   text,
  fame           integer not null default 0,
  primary key (battle_id, event_id)
);

create index if not exists idx_battle_kill_snapshots_battle
  on public.battle_kill_snapshots (battle_id, occurred_at);

alter table public.battles                enable row level security;
alter table public.battle_participants    enable row level security;
alter table public.battle_kill_snapshots  enable row level security;
revoke all on public.battles                from anon, authenticated;
revoke all on public.battle_participants    from anon, authenticated;
revoke all on public.battle_kill_snapshots  from anon, authenticated;

-- SELECT 권한을 public (anon, authenticated) 에 부여: 결과 카드는 로그인
-- 없이도 이벤트 상세에서 조회 가능해야 함. INSERT/UPDATE 는 서버 전용
-- (service role) 으로만.
grant select on public.battles              to anon, authenticated;
grant select on public.battle_participants  to anon, authenticated;
grant select on public.battle_kill_snapshots to anon, authenticated;
