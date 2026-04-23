-- 063_event_category.sql
--
-- 이벤트를 두 가지 카테고리로 분류한다: '전투' (정식 ZvZ 이벤트) 와 '기타'
-- (길드 이벤트·연습·친선전 등 비정기 활동). 기존엔 모두 '전투' 로 취급됐고
-- 홈 목록도 하나로 섞여 있었는데, 분리해서 표시하고 개인별 알림도
-- 카테고리별로 옵트아웃 할 수 있게 한다.
--
-- 변경점:
--   1. events.category text NOT NULL DEFAULT '전투' 추가.
--      기존 행은 전부 '전투' 로 backfill (DEFAULT 가 채워줌).
--   2. guild_avatars / guests 에 notify_combat / notify_other 추가.
--      기본 true — 기존 사용자의 수신 동작이 그대로 유지된다.
--      (discord_dm_enabled 가 false 이면 카테고리 설정은 무시되고 아예 발송 안 함.)
--   3. events(category, gather_at) 복합 인덱스 — 홈 목록에서 카테고리별로
--      임박/예정 분할 시 자주 같이 읽는다.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '전투';

ALTER TABLE events
  ADD CONSTRAINT events_category_check
  CHECK (category IN ('전투', '기타')) NOT VALID;

ALTER TABLE events VALIDATE CONSTRAINT events_category_check;

CREATE INDEX IF NOT EXISTS events_category_gather_at_idx
  ON events (category, gather_at);

ALTER TABLE guild_avatars
  ADD COLUMN IF NOT EXISTS notify_combat boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_other  boolean NOT NULL DEFAULT true;

ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS notify_combat boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_other  boolean NOT NULL DEFAULT true;
