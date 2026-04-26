-- 슈퍼어드민이 무활동 테넌트를 식별할 수 있도록 어드민 OAuth 로그인 시점을 기록.
-- /api/auth/discord/callback 등 admin 세션이 발급되는 경로에서 갱신한다.
-- NULL = 컬럼 추가 이후 어드민이 한 번도 로그인하지 않은 테넌트 — 슈퍼어드민 UI
-- 에서는 created_at 을 폴백으로 활용해 무활동 여부를 판단한다.

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS last_admin_login_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN tenants.last_admin_login_at IS
  'Last successful admin OAuth login for this tenant. Used by super-admin UI to surface inactive guilds.';
