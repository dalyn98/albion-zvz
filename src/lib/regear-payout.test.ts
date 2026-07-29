import { describe, expect, it } from 'vitest'
import {
  calcPayoutSilver,
  resolveRegearApprovalPayout,
  resolveRegearPayoutRatePercent,
  resolveRegearPreviewPayoutRatePercent,
} from './regear-payout'

describe('calcPayoutSilver', () => {
  it('floors the guild payout rate', () => {
    expect(calcPayoutSilver(1_000_001, 80)).toBe(800_000)
  })

  it('pays a role bonus when the role rate exceeds 100%', () => {
    expect(calcPayoutSilver(1_000_000, 125)).toBe(1_250_000)
  })

  it('keeps the payout inside the postgres integer range', () => {
    expect(calcPayoutSilver(2_000_000_000, 1_000)).toBe(2_147_483_647)
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
  it('accepts a role-specific bonus rate above 100%', () => {
    expect(
      resolveRegearPayoutRatePercent({
        baseRatePercent: 70,
        roleRatePercent: 125,
        videoRatePercent: 100,
        hasVideoProof: false,
      }),
    ).toBe(125)
  })

  it('does not reduce a role bonus when video proof is attached', () => {
    expect(
      resolveRegearPayoutRatePercent({
        baseRatePercent: 70,
        roleRatePercent: 125,
        videoRatePercent: 100,
        hasVideoProof: true,
      }),
    ).toBe(125)
  })

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

  it('keeps the role-specific payout rate when the guild video rate is higher', () => {
    expect(
      resolveRegearPayoutRatePercent({
        baseRatePercent: 70,
        roleRatePercent: 55,
        videoRatePercent: 100,
        hasVideoProof: true,
      }),
    ).toBe(55)
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

describe('resolveRegearPreviewPayoutRatePercent', () => {
  it('shows the server-resolved video rate when proof is attached', () => {
    expect(
      resolveRegearPreviewPayoutRatePercent({
        baseRatePercent: 60,
        videoRatePercent: 100,
        hasVideoProof: true,
      }),
    ).toBe(100)
  })

  it('shows the base rate before video proof is attached', () => {
    expect(
      resolveRegearPreviewPayoutRatePercent({
        baseRatePercent: 60,
        videoRatePercent: 100,
        hasVideoProof: false,
      }),
    ).toBe(60)
  })

  it('preserves a server-resolved role bonus above 100%', () => {
    expect(
      resolveRegearPreviewPayoutRatePercent({
        baseRatePercent: 125,
        videoRatePercent: 125,
        hasVideoProof: true,
      }),
    ).toBe(125)
  })
})
