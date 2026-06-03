import { describe, expect, it } from 'vitest'
import { calcPayoutSilver, resolveRegearApprovalPayout } from './regear-payout'

describe('calcPayoutSilver', () => {
  it('floors the guild payout rate', () => {
    expect(calcPayoutSilver(1_000_001, 80)).toBe(800_000)
  })
})

describe('resolveRegearApprovalPayout', () => {
  it('applies the guild payout rate to an admin override amount', () => {
    expect(
      resolveRegearApprovalPayout({
        claimedSilver: 1_000_000,
        ratePercent: 80,
        overrideSilver: 1_000_000,
      }),
    ).toEqual({ payoutSilver: 800_000 })
  })

  it('uses the full claimed amount as the basis when override is omitted', () => {
    expect(
      resolveRegearApprovalPayout({
        claimedSilver: 1_000_000,
        ratePercent: 80,
      }),
    ).toEqual({ payoutSilver: 800_000 })
  })

  it('rejects override amounts above the original claim before applying the rate', () => {
    expect(
      resolveRegearApprovalPayout({
        claimedSilver: 1_000_000,
        ratePercent: 80,
        overrideSilver: 1_000_001,
      }),
    ).toEqual({ error: 'payoutExceedsClaim' })
  })
})
