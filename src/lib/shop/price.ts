// 최종 포인트 가격 계산. 포인트와 실버는 1:1 동일 개념 — 수동 가격·자동 가격
// 모두 "실버 수량" 이고, `discountRate` (0 < rate ≤ 1) 를 곱해 포인트로 환산한다.
// 예: 자동 실버 1,000,000 × 할인율 0.5 = 500,000p.
// 수동 가격이 있으면 자동 시세 대신 수동 실버값을 사용. 어느 쪽도 없으면 null
// — /shop 에서 "가격 미정"으로 비활성화 표시.

export interface PriceInput {
  // 관리자가 수동으로 지정한 "할인 전 실버" 금액. 예: 500,000 을 입력하고
  // 할인율 0.5 면 /shop 에 250,000p 로 노출.
  manualPrice: number | null | undefined
  // AODP 에서 받은 판매 최저가(실버). 수동 가격이 없을 때 폴백 소스.
  autoPriceSilver: number | null | undefined
  // 할인율. 1.0 = 할인 없음, 0.5 = 50% 할인. 범위 (0, 1].
  discountRate: number
}

export function computePointPrice(input: PriceInput): number | null {
  const { manualPrice, autoPriceSilver, discountRate } = input
  const silver =
    typeof manualPrice === 'number' && manualPrice >= 0
      ? manualPrice
      : typeof autoPriceSilver === 'number' && autoPriceSilver > 0
        ? autoPriceSilver
        : null
  if (silver === null) return null
  const rate = Number.isFinite(discountRate) && discountRate > 0 ? discountRate : 1
  return Math.max(0, Math.ceil(silver * rate))
}

// 문자열 설정값 → 할인율(숫자). 파싱 실패·범위 벗어남은 1(할인 없음)로 폴백.
// 범위 (0, 1] 초과 입력(> 1)도 1 로 안전 클램프 — 과거 "1p=N실버" 설정값이
// 남아 있으면 마크업으로 오해되어 프라이스가 폭증하는 걸 막는다.
export function parseShopDiscountRate(raw: string | null | undefined): number {
  if (!raw) return 1
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.min(n, 1)
}
