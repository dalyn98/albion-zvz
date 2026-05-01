-- 138: 멘헤라 한정 AODP 시세 산정에서 품질 축 제거.
--
-- 변경 내역
--   1. aodp_quality_agnostic = 'true' — 같은 (uniqueName, enchant) 의 모든
--      품질 변종이 동일 자동가격을 공유한다. AODP 호출은 여전히 모든 품질
--      데이터를 받지만 응답에서 품질을 무시하고 (item, location) 단위로
--      가중 중앙값을 산출, 모든 품질 변종에 그대로 적용.
--
-- 도메인 근거
--   - 알비온 길드 운영상 품질 차이는 가격 의사결정에 거의 영향 없음 (사용자
--     도메인 합의). 품질이 낮은 변종에 폴백 chain 으로 Caerleon 가격이 박혀
--     실제로 저품질이 더 비싸 보이는 가격 역전 사례 발생.
--   - 인벤토리 행 자체는 품질별 유지 — 재고 추적은 그대로. 가격만 통합.
--
-- 적용 범위 (staged rollout)
--   - 멘헤라 슬러그만 명시 시드. 다른 테넌트는 미설정 시 'false' 기본값으로
--     기존 동작(품질별 별도 가격 + quality fallback) 유지.
--   - 멘헤라에서 1~2주 검증 후 별도 마이그레이션으로 전체 테넌트 적용 검토.
--
-- 영향 surface
--   - /shop: shop_inventory.auto_price_silver 다음 syncShopPrices 실행부터
--     품질 무관 단가로 갱신. 동일 (uniqueName, enchant) 의 모든 품질 행이
--     같은 auto_price_silver 를 공유.
--   - 자동 리기어 cron: 동일 옵션을 공유하므로 다음 회차부터 같은 시세 사용.

insert into public.app_settings (guild_id, key, value, updated_at)
select t.id, 'aodp_quality_agnostic', 'true', now()
  from public.tenants t
 where t.slug = 'menhera'
on conflict (guild_id, key) do update
  set value = 'true', updated_at = now();
