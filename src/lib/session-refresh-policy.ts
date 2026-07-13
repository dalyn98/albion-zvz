// 세션 쿠키의 절대 만료는 7일이지만, 실제로 앱을 쓰는 사용자는 활동을 기준으로
// 갱신한다. 서버의 서명/호스트/계정 타입 검증은 refresh route가 계속 담당한다.
export const SESSION_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000
export const SESSION_REFRESH_COOLDOWN_MS = 5 * 60 * 1000

export function shouldRefreshSessionOnActivity(input: {
  issuedAt: number
  lastAttemptAt: number
  now: number
}): boolean {
  const { issuedAt, lastAttemptAt, now } = input
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) return false
  if (!Number.isFinite(now) || now < issuedAt) return false
  if (
    Number.isFinite(lastAttemptAt) &&
    lastAttemptAt > 0 &&
    now - lastAttemptAt < SESSION_REFRESH_COOLDOWN_MS
  ) {
    return false
  }
  return now - issuedAt >= SESSION_REFRESH_INTERVAL_MS
}
