export const POSTGRES_INT_MAX = 2_147_483_647
export const REGEAR_CLAIM_CEILING_BONUS_MIN = 0
export const REGEAR_CLAIM_CEILING_BONUS_MAX = POSTGRES_INT_MAX
export const DEFAULT_VIDEO_CLAIM_CEILING_BONUS_SILVER = 0

export function isValidRegearClaimCeilingBonusSilver(bonusSilver: number): boolean {
  return (
    Number.isInteger(bonusSilver) &&
    bonusSilver >= REGEAR_CLAIM_CEILING_BONUS_MIN &&
    bonusSilver <= REGEAR_CLAIM_CEILING_BONUS_MAX
  )
}

export function parseRegearVideoClaimCeilingBonusSilver(
  raw: string,
  fallback: number = DEFAULT_VIDEO_CLAIM_CEILING_BONUS_SILVER,
): number {
  const parsed = Number(raw)
  return isValidRegearClaimCeilingBonusSilver(parsed) ? parsed : fallback
}

export function resolveRegearClaimCeilingSilver({
  baseCeilingSilver,
  videoCeilingBonusSilver,
  hasVideoProof,
}: {
  baseCeilingSilver: number
  videoCeilingBonusSilver: number
  hasVideoProof: boolean
}): number {
  const baseCeiling = Number.isFinite(baseCeilingSilver)
    ? Math.min(POSTGRES_INT_MAX, Math.max(0, Math.trunc(baseCeilingSilver)))
    : 0
  if (!hasVideoProof || baseCeiling <= 0) return baseCeiling
  if (!isValidRegearClaimCeilingBonusSilver(videoCeilingBonusSilver)) return baseCeiling
  return Math.min(POSTGRES_INT_MAX, baseCeiling + videoCeilingBonusSilver)
}
