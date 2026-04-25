-- Albion 길드 로스터 동기화용 테이블.
--
-- 배경: 기존 guild_avatars 는 PK 가 (guild_id, discord_id) 라 Discord 미연동
-- Albion 멤버를 담을 수 없다. 길드 ZvZ 통계는 "전 멤버 기준" 이 자연스럽고,
-- Albion gameinfo `/guilds/{id}/members` 가 공개 데이터라 프라이버시 이슈도
-- 없다 (이미 albionbattles.com 등 외부 사이트에서 누구나 조회 가능).
--
-- 설계:
--   - tenant 별 행 (한 알비온 길드를 두 tenant 가 동시에 추적할 일은 거의
--     없지만, multi-tenant 모델 일관성 위해 guild_id 분리)
--   - albion_player_id + albion_server 가 유일 식별자
--   - left_at 으로 soft-delete (sync 에서 사라지면 timestamp 기록, 재합류 시
--     null 로 되돌림)
--   - 통계 필드 (kill_fame 등) 는 sync 시점 스냅샷 — 실시간이 필요하면 외부
--     API 직접 조회. 여기는 리스트/정렬/검색 캐시로만 사용.

create table if not exists public.albion_guild_members (
  id uuid primary key default gen_random_uuid(),
  guild_id uuid not null references public.tenants(id) on delete cascade,

  albion_server text not null check (albion_server in ('west','east','europe')),
  albion_player_id text not null,
  albion_player_name text not null,
  -- sync 시점 스냅샷. 길드명/얼라이언스 변경/이전 길드 추적에 사용.
  albion_guild_id text not null,
  albion_guild_name text not null,
  albion_alliance_id text,
  albion_alliance_name text,

  -- gameinfo 응답 그대로 캐시. 다음 sync 마다 갱신.
  kill_fame bigint not null default 0,
  death_fame bigint not null default 0,
  fame_ratio numeric not null default 0,
  average_item_power numeric not null default 0,
  avatar text,
  avatar_ring text,

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  -- sync 에서 누락 발견 시 timestamp 기록. 재가입 시 null 로 reset.
  left_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 한 tenant 가 같은 (서버, 플레이어ID) 를 두 행으로 갖지 않도록.
  unique (guild_id, albion_server, albion_player_id)
);

-- 활성 멤버 리스트 정렬용. left_at IS NULL 인 행이 압도적이라 partial 인덱스.
create index if not exists idx_albion_guild_members_active
  on public.albion_guild_members (guild_id, last_seen_at desc)
  where left_at is null;

-- guild_avatars (Discord 연동) 와 join 시 사용. albion_player_id 기준.
create index if not exists idx_albion_guild_members_player
  on public.albion_guild_members (albion_server, albion_player_id);

-- 정렬용 (kill_fame 랭킹 등).
create index if not exists idx_albion_guild_members_kill_fame
  on public.albion_guild_members (guild_id, kill_fame desc)
  where left_at is null;

alter table public.albion_guild_members enable row level security;

-- RLS: service role 만 read/write. 클라이언트는 server action 또는 RSC 통해
-- 접근.
revoke all on public.albion_guild_members from anon, authenticated;

comment on table public.albion_guild_members is
  'Albion 길드 로스터 sync 결과. /guilds/{id}/members 6시간 주기 폴링. Discord 미연동 멤버까지 포함 — guild_avatars 와는 albion_player_id 로 left join.';
