-- Web Push 구독 저장소.
--
-- `endpoint` 가 구독 고유 식별자 (브라우저가 발급). 같은 유저가 여러 기기를
-- 쓸 수 있으므로 (endpoint) 에만 UNIQUE 를 걸고, discord_id 로는 다중 행을
-- 허용한다.
--
-- `p256dh`, `auth` 는 페이로드 암호화용 클라이언트 공개 키. Web Push 표준에
-- 정의된 base64url 문자열이라 text 그대로 저장.
--
-- FK 를 일부러 걸지 않는 이유: guild_members / guests 두 테이블 중 어느 쪽에
-- 붙여도 다른 쪽이 비게 된다. discord_id 는 앱 전역 identifier 로 쓰이고,
-- 삭제 시점에는 Discord ID 기반 cleanup 액션을 사용한다.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  discord_id text NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  -- 등록 시점의 UI 언어. 크론 기반 알림(이벤트 임박 등)은 요청자 locale 이 없으므로
  -- 이 값으로 문구를 선택한다. 기본 'ko' 로 두고 클라이언트가 registerPushSubscription
  -- 호출 시 현재 locale 을 함께 보내 덮어쓴다.
  locale text NOT NULL DEFAULT 'ko',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0
);

-- "이 유저에게 푸시 보내기" 가 주 쿼리 경로.
CREATE INDEX IF NOT EXISTS push_subscriptions_discord_id_idx
  ON push_subscriptions (discord_id);

-- 이벤트 임박 알림을 한 번만 보내기 위해 마지막 발송 시각을 기록한다.
-- NULL 이면 아직 미발송. 크론은 gather_at - 30m 부근이면서 이 값이 NULL 인
-- 이벤트만 대상으로 삼는다.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS imminent_notified_at timestamptz;
