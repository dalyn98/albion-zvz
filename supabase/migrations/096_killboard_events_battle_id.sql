-- killboard_events 에 battle_id 를 추가해 "어느 전투에서 일어난 죽음/킬"인지를
-- 기록한다. Albion `/players/{id}/{kills,deaths}` 응답에는 BattleId 가 항상 들어
-- 있는데 기존 sync 가 무시하고 있었다.
--
-- 배경: battle-tracker cron 의 `/battles?sort=recent` 페이지네이션은 Albion API
-- 인스턴스마다 결과가 살짝 다르고, 페이지가 깊어질수록 일부 전투를 누락한다.
-- 우리 길드가 실제로 참가한 전투는 멤버 킬/데스에 100% 반영되므로,
-- killboard_events.battle_id 를 hint 로 써서 누락된 battle 을 `/battles/{id}`
-- 로 직접 backfill 할 수 있다.
--
-- 인덱스: cron 의 backfill 패스가 "최근 N분 내, battle_records 에 없는 distinct
-- battle_id" 를 빠르게 찾을 수 있게 (guild_id, battle_id, occurred_at) 부분
-- 인덱스를 만든다 — battle_id IS NOT NULL 행만.
--
-- 기존 행은 NULL 이며 다음 sync 부터 채워진다. 과거 누락된 battle 까지 소급
-- 적용하려면 별도 스크립트로 events 를 다시 fetch 해야 하지만, 여기서는 새 sync
-- 부터 동작하면 충분.

alter table public.killboard_events
  add column if not exists battle_id bigint;

create index if not exists idx_killboard_events_battle_id_recent
  on public.killboard_events (guild_id, battle_id, occurred_at desc)
  where battle_id is not null;

comment on column public.killboard_events.battle_id is
  'Albion API 의 BattleId. /battles?sort=recent 누락분 backfill 의 hint 로 사용.';
