-- killboard_events 를 Discord 미연동 Albion 멤버까지 담을 수 있게 한다.
--
-- 배경: 기존 스키마는 discord_id 가 NOT NULL FK → guild_avatars 로 묶여 있어
-- Discord 가입자만 행을 가질 수 있었다. mig 090 에서 albion_guild_members
-- (전 길드 로스터) 가 추가되며 통계 모집단을 "전 멤버" 로 확장하기로 했고,
-- 그 전제 조건으로 미연동 멤버의 킬/데스도 저장돼야 한다.
--
-- 변경:
--   1) discord_id 를 nullable 로 (FK 는 유지 — 가입자는 여전히 무결성 보장).
--   2) (guild_id, albion_player_id, occurred_at desc) 인덱스 추가.
--      미연동 멤버 통계는 albion_player_id 로 집계되므로 필수.
--
-- 호환성: 기존 행은 모두 discord_id 를 갖고 있어 영향 없음. 새 sync 가
-- discord_id = NULL 로 INSERT 할 때만 의미가 있다.

alter table public.killboard_events
  alter column discord_id drop not null;

create index if not exists idx_killboard_events_albion_player_id
  on public.killboard_events (guild_id, albion_player_id, occurred_at desc);

comment on column public.killboard_events.discord_id is
  'Discord 가입자의 경우 채워짐. albion_guild_members 만 있고 guild_avatars 가 없는 미연동 멤버는 NULL — 이 경우 albion_player_id 로 집계.';
