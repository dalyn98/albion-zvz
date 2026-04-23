-- 064_event_category_expand.sql
--
-- 이벤트 카테고리를 2개 ('전투' / '기타') 에서 3개 ('전투' / 'FF' / '갱킹') 로 확장.
-- FF = 페임파밍 (솔로/소규모 PvE-with-PvP), 갱킹 = 소규모 PvP 스카우팅/킬링.
-- '기타' 카테고리는 사용된 적 없어 별도 backfill 불필요 (migration 063 직후
-- 바로 이어 붙음).
--
-- 변경점:
--   1. events.category CHECK 재정의 — 3개 값 허용.
--   2. guild_avatars / guests 의 notify_other → notify_ff + notify_ganking.
--      이 컬럼들도 사용된 적 없이 기본값으로만 존재했기에 단순 drop & add.
--   3. slot_templates.category 추가 — 템플릿도 카테고리별 구분.
--      기존 템플릿은 전부 '전투' 로 backfill (DEFAULT).
--   4. slot_templates(category, created_at desc) 복합 인덱스 — 카테고리별 목록
--      조회 시 정렬 포함해서 커버 가능.

-- events ----------------------------------------------------------------

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_category_check;

ALTER TABLE events
  ADD CONSTRAINT events_category_check
  CHECK (category IN ('전투', 'FF', '갱킹')) NOT VALID;

ALTER TABLE events VALIDATE CONSTRAINT events_category_check;

-- guild_avatars ---------------------------------------------------------

ALTER TABLE guild_avatars DROP COLUMN IF EXISTS notify_other;

ALTER TABLE guild_avatars
  ADD COLUMN IF NOT EXISTS notify_ff      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_ganking boolean NOT NULL DEFAULT true;

-- guests ----------------------------------------------------------------

ALTER TABLE guests DROP COLUMN IF EXISTS notify_other;

ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS notify_ff      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_ganking boolean NOT NULL DEFAULT true;

-- slot_templates --------------------------------------------------------

ALTER TABLE slot_templates
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '전투';

ALTER TABLE slot_templates
  ADD CONSTRAINT slot_templates_category_check
  CHECK (category IN ('전투', 'FF', '갱킹')) NOT VALID;

ALTER TABLE slot_templates VALIDATE CONSTRAINT slot_templates_category_check;

CREATE INDEX IF NOT EXISTS slot_templates_category_created_at_idx
  ON slot_templates (category, created_at DESC);
