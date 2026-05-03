-- 148: Phase B — AODP/리기어 시세 설정 전체 active 테넌트 일반화 (mig 136/137/138 후속).
--
-- 배경
--   Menhera 한정으로 검증된 3개 설정을 다른 테넌트에도 시드. 모두 admin 패널
--   (`/admin/dashboard/settings`) 에서 토글 가능하므로 ON CONFLICT DO NOTHING
--   가드로 admin 이 이미 다른 값을 명시한 케이스의 의도를 보존한다.
--
--   1. auto_regear_skip_low_confidence = 'true' (mig 136)
--      → 시세 confidence='low' 슬롯은 자동 청구를 건너뛰고 어드민 검토 대기열로.
--   2. aodp_price_mode = 'avg_7d' (mig 137 일부)
--      → 스팟가 → 7일 가중 중앙값. fire-sale/매크로 노이즈 둔감, 인게임 EMV 와 정합.
--   3. aodp_quality_agnostic = 'true' (mig 138)
--      → 같은 (uniqueName, enchant) 모든 품질 변종이 동일 단가. 가격 역전 방지.
--
--   aodp_cities 자체는 시드하지 않음. 별도 코드 변경 (DEFAULT_CITIES → 5 royal
--   corner) 으로 미설정 테넌트의 fallback 만 개선. admin 이 자기 길드 메인
--   trading hub 를 알면 settings 에서 단일 도시로 좁힐 수 있고, 모르면 5-city
--   pool 의 가중 중앙값을 그대로 사용한다.
--
-- 안전 가드
--   - on conflict do nothing — admin 이 이미 'false' 또는 다른 값을 설정한
--     케이스 보존 (사용자 커스텀 우선).
--   - 활성 테넌트만 대상 (status = 'active'). 정지/삭제/대기 테넌트 제외.
--   - 멘헤라는 이미 'true' 행 존재 → 영향 없음.
--
-- 영향 surface
--   - /shop: shop_inventory.auto_price_silver 가 다음 cron (1시간 주기) 부터
--     7일 가중 중앙값 + 품질 무관 단가로 갱신.
--   - 자동 리기어 cron (5분 주기): 같은 옵션 공유. low confidence 슬롯은
--     이번 회차부터 자동 청구 제외, 어드민 검토 대기열로.
--   - 이미 작성된 regear_requests / shop_inventory 는 영향 없음.

insert into public.app_settings (guild_id, key, value, updated_at)
select t.id, 'auto_regear_skip_low_confidence', 'true', now()
  from public.tenants t
 where t.status = 'active'
on conflict (guild_id, key) do nothing;

insert into public.app_settings (guild_id, key, value, updated_at)
select t.id, 'aodp_price_mode', 'avg_7d', now()
  from public.tenants t
 where t.status = 'active'
on conflict (guild_id, key) do nothing;

insert into public.app_settings (guild_id, key, value, updated_at)
select t.id, 'aodp_quality_agnostic', 'true', now()
  from public.tenants t
 where t.status = 'active'
on conflict (guild_id, key) do nothing;
