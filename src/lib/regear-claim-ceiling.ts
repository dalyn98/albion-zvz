export const REGEAR_CLAIM_CEILING_RATE_MIN = 1
export const REGEAR_CLAIM_CEILING_RATE_MAX = 300
export const DEFAULT_VIDEO_CLAIM_CEILING_RATE_PERCENT = 100

export function isValidRegearClaimCeilingRatePercent(ratePercent: number): boolean {
  return (
    Number.isInteger(ratePercent) &&
    ratePercent >= REGEAR_CLAIM_CEILING_RATE_MIN &&
    ratePercent <= REGEAR_CLAIM_CEILING_RATE_MAX
  )
}

export function parseRegearVideoClaimCeilingRatePercent(
  raw: string,
  fallback: number = DEFAULT_VIDEO_CLAIM_CEILING_RATE_PERCENT,
): number {
  const parsed = Number(raw)
  return isValidRegearClaimCeilingRatePercent(parsed) ? parsed : fallback
}

export function resolveRegearClaimCeilingSilver({
  baseCeilingSilver,
  videoCeilingRatePercent,
  hasVideoProof,
}: {
  baseCeilingSilver: number
  videoCeilingRatePercent: number
  hasVideoProof: boolean
}): number {
  const baseCeiling = Number.isFinite(baseCeilingSilver)
    ? Math.max(0, Math.trunc(baseCeilingSilver))
    : 0
  if (!hasVideoProof || baseCeiling <= 0) return baseCeiling
  if (!isValidRegearClaimCeilingRatePercent(videoCeilingRatePercent)) return baseCeiling
  return Math.max(1, Math.floor((baseCeiling * videoCeilingRatePercent) / 100))
}
