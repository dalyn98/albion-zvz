import { describe, expect, it } from 'vitest'
import {
  calcPayoutSilver,
  resolveRegearApprovalPayout,
  resolveRegearPayoutRatePercent,
} from './regear-payout'

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

describe('resolveRegearPayoutRatePercent', () => {
  it('uses a role-specific payout rate before the guild default', () => {
    expect(
      resolveRegearPayoutRatePercent({
        baseRatePercent: 70,
        roleRatePercent: 85,
        videoRatePercent: 100,
        hasVideoProof: false,
      }),
    ).toBe(85)
  })

  it('falls back to the role-specific payout rate when the video rate is malformed', () => {
    expect(
      resolveRegearPayoutRatePercent({
        baseRatePercent: 70,
        roleRatePercent: 85,
        videoRatePercent: 0,
        hasVideoProof: true,
      }),
    ).toBe(85)
  })

  it('uses the video proof payout rate when the request has a video proof', () => {
    expect(
      resolveRegearPayoutRatePercent({
        baseRatePercent: 70,
        videoRatePercent: 100,
        hasVideoProof: true,
      }),
    ).toBe(100)
  })

  it('keeps the base payout rate when the request has no video proof', () => {
    expect(
      resolveRegearPayoutRatePercent({
        baseRatePercent: 70,
        videoRatePercent: 100,
        hasVideoProof: false,
      }),
    ).toBe(70)
  })

  it('falls back to the base payout rate when the video rate is malformed', () => {
    expect(
      resolveRegearPayoutRatePercent({
        baseRatePercent: 70,
        videoRatePercent: 0,
        hasVideoProof: true,
      }),
    ).toBe(70)
  })
})
