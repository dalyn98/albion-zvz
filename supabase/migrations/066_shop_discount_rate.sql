-- 066: 상점 "환율 (1p=N실버)" → "할인율 (0<rate≤1)" 시맨틱 전환.
--
-- 포인트와 실버는 1:1 동일 개념으로 재정립. 수동/자동 가격 모두 실버 단위로
-- 저장되고, 노출 포인트는 silver * discountRate 로 계산한다. 따라서 기존
-- shop_silver_to_point_rate (예: '1' = "1p=1실버") 값은 새 시맨틱에서 "할인
-- 없음"과 동등하므로 그대로 가져가도 안전하지만, '10' 같은 값이 남아 있으면
-- 1000% 마크업으로 오해되어 전 상점 가격이 폭증할 수 있어 일괄 '1' 로 초기화
-- 한다. 관리자는 설정 페이지에서 명시적으로 0.5 (50%) 등을 다시 지정.

INSERT INTO app_settings (key, value, updated_at)
VALUES ('shop_discount_rate', '1', now())
ON CONFLICT (key) DO UPDATE
  SET value = EXCLUDED.value,
      updated_at = EXCLUDED.updated_at;

DELETE FROM app_settings WHERE key = 'shop_silver_to_point_rate';
