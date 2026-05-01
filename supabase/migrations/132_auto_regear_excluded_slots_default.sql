-- 132: 자동 리기어 제외 슬롯 기본값 변경 (홈 길드 한정).
--
-- 배경: mig 131 에서는 모든 테넌트에 빈 배열 '[]' 을 seed 했지만, 길드 표준
-- 운영상 음식·망토·탈것·포션은 리기어 비대상이라는 사례가 더 많아 기본값을
-- '["food","cape","mount","potion"]' 로 변경. 코드 fallback 도 같이 갱신된다
-- (auto-regear.ts, settings/page.tsx). 즉 신규 테넌트는 자동으로 새 기본값.
--
-- 적용 범위: staged-rollout 규칙상 홈 길드(menhera) 만 즉시 갱신. 다른 테넌트는
-- 본 길드에서 검증 후 별도 마이그로 일괄 적용 예정. 이미 사용자가 UI 로 커스
-- 터마이즈한 행은 ('[]' 가 아닌 행) 의도적인 설정이므로 건드리지 않는다.

update public.app_settings
   set value = '["food","cape","mount","potion"]', updated_at = now()
  from public.tenants t
 where app_settings.guild_id = t.id
   and t.slug = 'menhera'
   and app_settings.key = 'auto_regear_excluded_slots'
   and app_settings.value = '[]';
