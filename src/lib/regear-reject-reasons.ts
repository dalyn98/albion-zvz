// 리기어 거절 사유 enum. DB 의 regear_requests.reject_reason_code 와 1:1 매칭.
// 마이그 151 에서 CHECK 제약으로 강제됨.
//
// 관리자가 거절 시 드롭다운으로 한 개를 선택 (필수).
// 멤버는 자기 거절된 신청을 볼 때 i18n 라벨로 사유를 본다 (+ 옵션으로 admin_notes 도).

export const REGEAR_REJECT_REASON_CODES = [
  'killboard_mismatch',
  'out_of_window',
  'screenshot_invalid',
  'price_inflated',
  'duplicate_request',
  'not_eligible_event',
  'not_actual_participant',
  'insufficient_evidence',
  'other',
] as const

export type RegearRejectReasonCode = (typeof REGEAR_REJECT_REASON_CODES)[number]

export function isRegearRejectReasonCode(value: unknown): value is RegearRejectReasonCode {
  return (
    typeof value === 'string' &&
    (REGEAR_REJECT_REASON_CODES as readonly string[]).includes(value)
  )
}

// next-intl `useTranslations('regearRejectReason')` / `getTranslations(...)` 와 함께 쓰는
// helper. 같은 enum 키를 i18n 키로 그대로 사용.
export function translateRegearRejectReason(
  code: RegearRejectReasonCode,
  t: (key: RegearRejectReasonCode) => string,
): string {
  return t(code)
}
