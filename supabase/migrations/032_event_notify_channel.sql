-- 이벤트별 공지 채널 지정.
--
-- 그동안 이벤트 공지는 env DISCORD_EVENT_CHANNEL_ID 한 곳으로만 고정이었다.
-- 운영 중 "특정 이벤트는 다른 채널에 띄워야 한다" 는 요구가 잦아져, 이벤트
-- 자체에 채널 ID 를 매달고 편집 화면에서 고를 수 있게 한다.
--
-- 동작:
--   - notify_channel_id = NULL → discord.ts 는 env fallback 을 사용
--   - notify_channel_id = 'xxx' → 그 채널로 전송
-- 생성 시점에는 설정하지 않고(새 이벤트 폼은 공지 UI 를 숨김), 편집 단계에서
-- 채널을 고르는 흐름.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS notify_channel_id text;
