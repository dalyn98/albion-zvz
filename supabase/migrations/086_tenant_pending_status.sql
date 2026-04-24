-- 086: tenants.status 에 'pending' 상태 허용 + check constraint 추가.
--
-- 배경: bot-callback 이 tenant 를 INSERT 할 때 즉시 status='active' 로 만들어
-- 온보딩 위저드가 완료 전인데도 subdomain 이 "활성"으로 보였다. 유저가 위저드
-- 중간에 이탈하면 admin_role_ids 가 비어 있거나 역할이 누락된 채로 "활성"
-- tenant 가 남아 자기 자신을 로그인으로 들이지 못하는 silent lockout 이 발생.
--
-- 이 마이그는:
--   1) check constraint 을 명시적으로 걸어 알려진 status 값만 허용한다.
--      ('pending', 'active', 'suspended', 'deleted')
--   2) 데이터는 그대로 둔다 — 현재 모든 tenant 는 'active' 이므로 유효.
--
-- 앱 변경(같은 PR):
--   - bot-callback 은 신규 INSERT 때 status='pending' 를 쓴다.
--   - saveTenantRewards (위저드 3단계 완료) 에서 status='active' 로 flip.
--   - resolveTenantBySlug 는 이미 .eq('status', 'active') 필터로 pending 을
--     subdomain 해상도에서 제외하고 있었다 — 이 마이그는 DB 레벨에서 잘못된
--     status 값이 들어가는 것만 막는다.

alter table public.tenants
  drop constraint if exists tenants_status_check;

alter table public.tenants
  add constraint tenants_status_check
    check (status in ('pending', 'active', 'suspended', 'deleted'));

comment on column public.tenants.status is
  'tenant 생명주기: pending(온보딩 미완), active(정상), suspended(결제/어뷰즈 정지), deleted(tombstone).';
