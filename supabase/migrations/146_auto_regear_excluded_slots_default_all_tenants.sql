-- 146: 자동 리기어 제외 슬롯 기본값 — 전체 active 테넌트로 일반화 (mig 132 후속).
--
-- 배경
--   mig 131 에서 모든 테넌트에 빈 배열 '[]' 을 시드, mig 132 에서 홈 길드
--   (menhera) 만 음식/망토/탈것/포션 기본값으로 갱신했다. 1주 검증 결과
--   안정적이고 어드민 패널 (`/admin/dashboard/settings`) 에서 사용자 토글
--   가능 (auto_regear_excluded_slots) 하므로 다른 테넌트도 동일한 기본값
--   으로 일괄 갱신.
--
-- 안전 가드
--   - WHERE value = '[]' 조건 유지. 어드민이 이미 명시적으로 다른 값을
--     선택했다면 그 의도를 보존한다 (사용자 커스텀 보호).
--   - 활성 테넌트만 대상 (status = 'active'). 정지/삭제/대기 테넌트 제외.
--   - 기본값 변경 후에도 어드민 패널에서 다시 빈 배열로 되돌릴 수 있다.
--
-- 영향 surface
--   - 자동 리기어 cron 의 다음 회차 (5분) 부터 음식/망토/탈것/포션 슬롯이
--     자동 리기어 청구에서 제외됨. 청구자가 어드민 패널에서 설정 변경
--     가능.
--   - 이미 작성된 regear_requests 는 영향 없음.

update public.app_settings
   set value = '["food","cape","mount","potion"]', updated_at = now()
  from public.tenants t
 where app_settings.guild_id = t.id
   and t.status = 'active'
   and app_settings.key = 'auto_regear_excluded_slots'
   and app_settings.value = '[]';
