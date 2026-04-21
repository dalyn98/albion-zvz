// 최종 표시 포인트 가격 계산. manual_price 가 있으면 그대로, 없으면 auto/rate 환산.
// rate 는 "1 포인트 = N 실버" 의 N. auto_price_silver / rate 를 올림하여 포인트로 반올림.
// 어느 쪽도 없으면 null — /shop 에서 "가격 미정"으로 비활성화 표시.

export interface PriceInput {
  manualPrice: number | null | undefined
  autoPriceSilver: number | null | undefined
  silverToPointRate: number
}

export function computePointPrice(input: PriceInput): number | null {
  const { manualPrice, autoPriceSilver, silverToPointRate } = input
  if (typeof manualPrice === 'number' && manualPrice >= 0) return manualPrice
  if (typeof autoPriceSilver === 'number' && autoPriceSilver > 0) {
    const rate = silverToPointRate > 0 ? silverToPointRate : 1
    return Math.ceil(autoPriceSilver / rate)
  }
  return null
}

export function parseSilverToPointRate(raw: string | null | undefined): number {
  if (!raw) return 1
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) return 1
  return Math.trunc(n)
}
