-- 136: 자동 리기어 — AODP 신뢰도 낮은 슬롯 자동 제외 토글 (홈 길드 한정).
--
-- 배경: 자동 리기어가 만드는 gear_breakdown.items 의 price 가 AODP fallback 체인
-- 의 redzone/bluezone 단계 또는 history 표본<=1 인 경우 'low confidence' 로 분류
-- 된다. 이 토글이 'true' 면 cron 이 해당 슬롯의 price 를 null 로 떨어뜨려
-- marketSilver 합산에서 제외하고 청구자가 직접 입력하도록 강제. 'false' (기본)
-- 면 기존 동작 유지 — confidence 정보만 UI 배지로 표시.
--
-- 적용 범위: staged-rollout 규칙상 홈 길드(menhera) 만 'true' 로 seed. 다른 테넌
-- 트는 본 길드에서 검증 후 별도 마이그로 일괄 적용. 신규 테넌트는 코드 fallback
-- ('false') 로 OFF 상태 시작.

insert into public.app_settings (guild_id, key, value, updated_at)
select t.id, 'auto_regear_skip_low_confidence', 'true', now()
  from public.tenants t
 where t.slug = 'menhera'
on conflict (guild_id, key) do update
  set value = 'true', updated_at = now();
