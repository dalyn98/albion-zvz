// Keep the rounding rule (floor) in one place. Matches the DB defensive
// bounds in migration 044 — the RPC also clamps to [0, claimed] so this
// helper can stay pure and UI-safe.
export function calcPayoutSilver(claimedSilver: number, ratePercent: number): number {
  if (claimedSilver <= 0) return 0
  return Math.floor((claimedSilver * ratePercent) / 100)
}

export type RegearApprovalPayoutError = 'nonNegativeInteger' | 'payoutExceedsClaim'

export function resolveRegearApprovalPayout({
  claimedSilver,
  ratePercent,
  overrideSilver,
}: {
  claimedSilver: number
  ratePercent: number
  overrideSilver?: number
}): { payoutSilver: number } | { error: RegearApprovalPayoutError } {
  if (typeof overrideSilver === 'number') {
    if (!Number.isInteger(overrideSilver) || overrideSilver < 0) {
      return { error: 'nonNegativeInteger' }
    }
    if (overrideSilver > claimedSilver) {
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
