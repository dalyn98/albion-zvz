// Silver → 표시용 포맷터. 원 단위 그대로 (콤마 구분). 절삭 없음.
// 예: 3,549,999 → "3,549,999"

export function formatSilver(silver: number): string {
  return silver.toLocaleString('en-US')
}

// 원 단위 silver 문자열을 정수로 환산. 콤마 허용. 잘못된 값이면 null.
// 예: "3,549,999" → 3549999, "500000" → 500000
export function parseSilverInput(input: string): number | null {
  const trimmed = input.trim().replace(/,/g, '')
  if (!trimmed) return null
  const n = Number(trimmed)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.trunc(n)
}
