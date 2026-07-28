export const EXCHANGE_GAMEPLAY_VIDEO_WINDOW_DAYS = 5

const DAY_MS = 24 * 60 * 60 * 1000

export function gameplayVideoEligibleUntil(uploadedAt: string): string | null {
  const uploadedAtMs = Date.parse(uploadedAt)
  if (!Number.isFinite(uploadedAtMs)) return null
  return new Date(uploadedAtMs + EXCHANGE_GAMEPLAY_VIDEO_WINDOW_DAYS * DAY_MS).toISOString()
}

export function hasRecentGameplayVideo(
  uploadedAt: string | null,
  now: Date = new Date(),
): boolean {
  if (!uploadedAt) return false
  const eligibleUntil = gameplayVideoEligibleUntil(uploadedAt)
  return eligibleUntil !== null && Date.parse(eligibleUntil) >= now.getTime()
}
