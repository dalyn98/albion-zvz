import { POSTGRES_INT_MAX } from '@/lib/postgres-int'

export const REGEAR_ROLE_PAYOUT_RATE_MIN = 1
export const REGEAR_ROLE_PAYOUT_RATE_MAX = 1_000

// Keep the rounding and DB integer bound in one place so previews, snapshots,
// and approval RPC inputs agree even when a role bonus exceeds 100%.
export function calcPayoutSilver(claimedSilver: number, ratePercent: number): number {
  if (!Number.isFinite(claimedSilver) || !Number.isFinite(ratePercent)) return 0
  if (claimedSilver <= 0 || ratePercent <= 0) return 0
  return Math.min(POSTGRES_INT_MAX, Math.floor((claimedSilver * ratePercent) / 100))
}

function isValidStandardRatePercent(ratePercent: number): boolean {
  return Number.isInteger(ratePercent) && ratePercent >= 1 && ratePercent <= 100
}

export function isValidRoleRegearPayoutRate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= REGEAR_ROLE_PAYOUT_RATE_MIN &&
    value <= REGEAR_ROLE_PAYOUT_RATE_MAX
  )
}

export function resolveRegearPayoutRatePercent({
  baseRatePercent,
  roleRatePercent,
  videoRatePercent,
  hasVideoProof,
}: {
  baseRatePercent: number
  roleRatePercent?: number | null
  videoRatePercent: number
  hasVideoProof: boolean
}): number {
  const roleRate = roleRatePercent ?? NaN
  const baseRate = isValidRoleRegearPayoutRate(roleRate)
    ? roleRate
    : isValidStandardRatePercent(baseRatePercent)
      ? baseRatePercent
      : 100
  if (!hasVideoProof) return baseRate
  if (isValidRoleRegearPayoutRate(roleRate)) return roleRate
  return isValidStandardRatePercent(videoRatePercent)
    ? Math.max(baseRate, videoRatePercent)
    : baseRate
}

export type RegearApprovalPayoutError = 'nonNegativeInteger' | 'payoutExceedsClaim'

export function resolveRegearApprovalPayout({
  claimedSilver,
  ratePercent,
  overrideSilver,
  capSilver,
}: {
  claimedSilver: number
  ratePercent: number
  overrideSilver?: number
  capSilver?: number | null
}): { payoutSilver: number } | { error: RegearApprovalPayoutError } {
  const maxBasis =
    typeof capSilver === 'number' && Number.isInteger(capSilver) && capSilver >= 0
      ? Math.max(claimedSilver, capSilver)
      : claimedSilver
  if (typeof overrideSilver === 'number') {
    if (!Number.isInteger(overrideSilver) || overrideSilver < 0) {
      return { error: 'nonNegativeInteger' }
    }
    if (overrideSilver > maxBasis) {
      return { error: 'payoutExceedsClaim' }
    }
  }

  return {
    payoutSilver: calcPayoutSilver(
      typeof overrideSilver === 'number' ? overrideSilver : claimedSilver,
      ratePercent,
    ),
  }
}
