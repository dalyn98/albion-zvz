-- 길드 페이지(`/g/<slug>`) 가 멘헤라의 사실상 "홈" 이 되면서, 기존 `/` 홈 페이지
-- 의 어드민 처리 대기 카드(HomeAdminPendingCard) 가 두 곳에 동시에 노출된다.
-- 중복을 막기 위해 멘헤라만 홈쪽 토글(`home_admin_pending_card_enabled`) 을
-- 'false' 로 내린다. 길드 페이지의 동일 카드는 `member_dashboard_enabled` (mig
-- 121) 게이트로 노출되므로 어드민이 처리할 일을 놓치는 시나리오는 없다.
--
-- 다른 테넌트 (멘헤라 외) 는 영향 받지 않는다 — 이 토글의 기본값은 OFF 이고,
-- 명시적으로 ON 한 길드만 홈에 카드가 보인다.
update public.app_settings
   set value = 'false', updated_at = now()
  from public.tenants t
 where app_settings.guild_id = t.id
   and t.slug = 'menhera'
   and app_settings.key = 'home_admin_pending_card_enabled';
