-- 길드원이 아닌 외부 참가자(게스트)를 받기 위한 테이블.
--
-- 관리자가 app_settings 의 guest_invite_token 에 문자열을 설정하면, 그 토큰이
-- 포함된 링크(`?invite=...`)로 들어온 사용자가 Discord 로그인 시 게스트로
-- 등록된다. 게스트는 사이트 열람과 파티 슬롯 자원만 가능하고 리기어 요청
-- 같은 길드원 전용 기능은 차단된다. 게스트 권한은 guests 테이블의 존재로
-- 판정 — 관리자가 행을 지우면 다음 로그인부터 막힌다 (이미 발급된 세션
-- 쿠키는 최대 7일 남는 한계 있음).
--
-- discord_id 를 PK 로 둬서 같은 사용자가 중복 등록되는 것을 막는다.
-- guild_avatars 와 구조가 비슷하지만 용도는 완전히 분리 — 길드원(과거 로그인
-- 기록 포함)과 게스트는 조인하지 않는다.

CREATE TABLE IF NOT EXISTS guests (
  discord_id text PRIMARY KEY,
  username text NOT NULL,
  avatar text,
  joined_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guests_joined_at_idx
  ON guests (joined_at DESC);

-- 초대 토큰 슬롯만 예약 — 값이 비어 있으면 "게스트 초대 비활성화" 로 해석.
-- 관리자는 /admin/dashboard/settings 에서 토큰 문자열을 채우거나 비운다.
INSERT INTO app_settings (key, value) VALUES
  ('guest_invite_token', '')
ON CONFLICT (key) DO NOTHING;
