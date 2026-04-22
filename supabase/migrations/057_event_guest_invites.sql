-- 이벤트별 게스트 초대 링크.
--
-- 기존 전역 `app_settings.guest_invite_token` 은 제거하고, 대신 관리자(또는
-- 이벤트 작성자)가 이벤트 상세페이지에서 각 이벤트에 한정된 초대 링크를
-- 발급한다. 링크로 들어온 게스트는 해당 event_id 스코프 세션을 받아 그
-- 이벤트 외에는 접근하지 못한다 (layout 레벨에서 redirect 로 차단).
--
-- - 링크는 재사용 가능. 여러 명이 같은 링크로 들어와도 각각 guests 행 생성.
-- - 만료: `expires_at`. 일반적으로 `events.gather_at + 24h` 로 세팅. 서버
--   액션에서 계산하고, cron 없이 SELECT 시점에 필터링.
-- - 폐기: 관리자가 `revoked_at` 세팅. revoke 된 토큰은 이후 로그인을 막지만
--   이미 발급된 세션 쿠키는 7일까지 유효 (기존 게스트와 동일 한계).

CREATE TABLE IF NOT EXISTS event_guest_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_by text,
  created_by_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS event_guest_tokens_event_id_idx
  ON event_guest_tokens (event_id, created_at DESC);

-- 토큰 문자열 lookup 경로. 콜백에서 cookie → 이 UNIQUE 인덱스로 조회.
-- (token UNIQUE 제약이 이미 인덱스 역할을 하므로 추가 인덱스 불필요.)

-- 전역 게스트 토큰 폐기.
DELETE FROM app_settings WHERE key = 'guest_invite_token';
