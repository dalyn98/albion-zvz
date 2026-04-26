-- 이벤트별 @everyone 멘션 옵트인. notify_role_id 와 별개로 동작 — 둘 다 활성화
-- 되어 있으면 둘 다 멘션된다. 기본값 false 로 두어 기존 이벤트는 그대로 조용한
-- 채널 공지를 유지.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS notify_everyone BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN events.notify_everyone IS
  'When true, the Discord channel announcement prepends @everyone and allows the everyone mention. Independent of notify_role_id.';
