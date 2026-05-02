-- 142: 멘헤라 한정 AODP `aodp_cities` 를 단일 도시 (Bridgewatch) 로 축소.
--
-- 변경 내역
--   1. aodp_cities = '["Bridgewatch"]' — mig 137 이 시드한 5-city 배열을
--      단일 기준 도시로 collapse. 어드민 폼이 이미 라디오 1개 = `[city]` 로
--      저장하므로 폼 저장과 동일한 모양.
--
-- 도메인 근거
--   - aodp.ts 의 primary+pooled 폴백 로직을 활성화. 코드 변경 (이 마이그와
--     같은 PR) 으로 `primaryCity = cities[0] ?? ''` 가 되어 다중 도시 시드도
--     첫 도시가 자동 primary 로 잡히지만, 의도 명확성을 위해 시드값도 단일화.
--   - mig 137 이 5-city 시드를 도입한 시점엔 primary 모드가 없었음 (multi-city min
--     의도). primary+pooled 도입(커밋 6fee6da) 이후 5-city 시드는 의미가 사라짐.
--
-- 적용 범위
--   - 멘헤라 슬러그만 명시. 다른 테넌트는 이미 aodp_cities 미설정 상태이므로
--     코드 fallback (DEFAULT_CITIES = 7 royal+caer+brec) 으로 자연 진입.
--     해당 테넌트가 어드민 폼에서 도시를 선택+저장하면 자동으로 단일 도시 +
--     primary 모드 활성화.
--
-- 영향 surface
--   - /shop: 다음 syncShopPrices (1h cron) 부터 가격이 갱신됨. 멘헤라의
--     price_source 분포가 다중 도시 → Bridgewatch + pooled 로 수렴.
--   - 자동 리기어: 다음 5분 cron 부터 새 시세 사용.
--   - 설정 폼: 라디오 표시는 변화 없음 (이미 첫 도시 = Bridgewatch 였음).

insert into public.app_settings (guild_id, key, value, updated_at)
select t.id, 'aodp_cities', '["Bridgewatch"]', now()
  from public.tenants t
 where t.slug = 'menhera'
on conflict (guild_id, key) do update
  set value = '["Bridgewatch"]', updated_at = now();
