-- 137: 멘헤라 한정 AODP 시세 산정 방식을 인게임 추정가에 맞춤.
--
-- 변경 내역
--   1. aodp_price_mode = 'avg_7d'  — /stats/history 7일치 가중 중앙값 사용
--      (이전: 'spot' 현재 최저 호가). 알비온 인게임 "Estimated Market Value"
--      가 royal city 의 주간 중앙값을 채택한다는 커뮤니티 합의를 모방.
--   2. aodp_cities = 5개 royal corner city 만 사용 (Bridgewatch, Lymhurst,
--      Martlock, Thetford, Fort Sterling). Caerleon (red zone, 가격 변동성
--      큼) 과 Brecilien (Avalonian outlands hub, 거래 패턴 별개) 제외.
--
-- 적용 범위 (staged rollout)
--   - 멘헤라 슬러그만 명시 시드. 다른 테넌트는 aodp_cities 미설정 시 코드의
--     DEFAULT_CITIES (= 7개 전체) 로 폴백, 모드는 'spot' 기본값 유지.
--   - 멘헤라에서 1~2주 검증 후 별도 마이그레이션으로 전체 테넌트 적용.
--   - 신규 테넌트는 코드 fallback 으로 OFF 상태 시작.
--
-- 영향 surface
--   - /shop: shop_inventory.auto_price_silver 다음 syncShopPrices 실행부터
--     median 기반 가격으로 갱신. 기존 저장값은 그대로 유지 — 후속 cron 또는
--     관리자 수동 동기화로 자연 갱신.
--   - 자동 리기어 cron: 다음 회차부터 즉시 적용 (라이브 fetch 라 staleness 없음).

insert into public.app_settings (guild_id, key, value, updated_at)
select t.id, 'aodp_price_mode', 'avg_7d', now()
  from public.tenants t
 where t.slug = 'menhera'
on conflict (guild_id, key) do update
  set value = 'avg_7d', updated_at = now();

insert into public.app_settings (guild_id, key, value, updated_at)
select
  t.id,
  'aodp_cities',
  '["Bridgewatch","Lymhurst","Martlock","Thetford","Fort Sterling"]',
  now()
  from public.tenants t
 where t.slug = 'menhera'
on conflict (guild_id, key) do update
  set value = '["Bridgewatch","Lymhurst","Martlock","Thetford","Fort Sterling"]',
      updated_at = now();
