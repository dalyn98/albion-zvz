-- 131: 자동 리기어 슬롯 필터 (auto_regear_excluded_slots).
--
-- 배경: 자동 리기어가 9 개 슬롯(weapon/offhand/head/armor/shoes/cape/mount/
-- potion/food) 의 AODP 시세를 모두 합산해 estimated_silver/payout 을 결정한다.
-- 음식·포션·탈것 등은 길드 정책상 리기어 대상이 아닐 수 있어 합산에서 빼고
-- 싶다는 요구가 들어왔다.
--
-- 저장 형태: app_settings 의 단일 row, key='auto_regear_excluded_slots',
-- value 는 JSON 배열 문자열 (예: '["food","potion","mount"]'). 빈 배열 '[]' =
-- 어떤 슬롯도 제외하지 않음 = 기존 동작 유지. 검증은 settings.ts 측이 담당.
--
-- 기본값: 모든 기존 테넌트에 빈 배열을 seed 한다 (현재 동작 보존). 신규 테넌트
-- 는 row 부재 시 getAppSetting fallback '[]' 로 같은 결과.

insert into public.app_settings (guild_id, key, value)
select t.id, 'auto_regear_excluded_slots', '[]'
from public.tenants t
where not exists (
  select 1 from public.app_settings s
  where s.guild_id = t.id
    and s.key = 'auto_regear_excluded_slots'
);
