// Keep the rounding rule (floor) in one place. Matches the DB defensive
// bounds in migration 044 — the RPC also clamps to [0, claimed] so this
// helper can stay pure and UI-safe.
export function calcPayoutSilver(claimedSilver: number, ratePercent: number): number {
  if (claimedSilver <= 0) return 0
  return Math.floor((claimedSilver * ratePercent) / 100)
}
