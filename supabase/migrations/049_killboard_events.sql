-- 킬보드 이벤트 캐시. 길드 멤버가 killer 또는 victim 으로 등장한 Albion
-- killboard 이벤트를 저장한다. `/api/cron/killboard-sync` 가 주기적으로
-- `/players/{id}/kills` 와 `/deaths` 를 폴링해 upsert 한다.
--
-- 왜 raw 기록을 남기는가:
--   1. 주간 MVP, 이벤트 기간 K/D 등 다양한 집계를 나중에 재계산할 수 있음.
--   2. Phase 3 자동 리기어가 victim 행의 `equipment` JSONB 를 그대로 쓴다 —
--      AODP 시세 조회 → 지급액 계산 → regear_requests 자동 생성.
--
-- PK 가 (event_id, role) 인 이유: 같은 이벤트에 Menhera 가 killer 이자
-- victim 인 경우(= 길드 내 오폭) 는 드물지만 발생할 수 있다. role 별로 한
-- 행씩 저장해야 양쪽 통계가 모두 정확.

create table if not exists public.killboard_events (
  event_id          bigint      not null,
  role              text        not null check (role in ('killer', 'victim')),
  discord_id        text        not null references public.guild_avatars(discord_id) on delete cascade,
  albion_player_id  text        not null,
  player_name       text        not null,
  opponent_name     text,
  opponent_guild    text,
  -- TotalVictimKillFame. killer/victim 모두에게 같은 값을 저장해
  -- SUM 집계가 일관되게 나오게 한다.
  fame              integer     not null default 0,
  item_power        integer,
  occurred_at       timestamptz not null,
  -- victim 행에만 채워짐. Phase 3 의 자동 리기어가 이 JSONB 로부터 장비
  -- 부위별 가치를 계산한다. killer 행은 equipment = null.
  equipment         jsonb,
  created_at        timestamptz not null default now(),
  primary key (event_id, role)
);

create index if not exists idx_killboard_events_member_time
  on public.killboard_events (discord_id, occurred_at desc);

create index if not exists idx_killboard_events_occurred_at
  on public.killboard_events (occurred_at desc);

alter table public.killboard_events enable row level security;
revoke all on public.killboard_events from anon, authenticated;

-- Albion 인게임 player_id 를 guild_avatars 에 캐시. 킬보드 sync 와 리기어
-- 검증이 매번 `/search` 를 쳐서 이름으로 찾지 않고 바로 /players/{id} 로
-- 진입할 수 있게 한다. 첫 성공적 매칭 때 sync 가 채워 넣음.
alter table public.guild_avatars
  add column if not exists albion_player_id text;

create index if not exists idx_guild_avatars_albion_player_id
  on public.guild_avatars (albion_player_id)
  where albion_player_id is not null;
