import { describe, expect, it } from 'vitest'
import {
  POSTGRES_INT_MAX,
  parseRegearVideoClaimCeilingBonusSilver,
  resolveRegearClaimCeilingSilver,
} from './regear-claim-ceiling'

describe('resolveRegearClaimCeilingSilver', () => {
  it('keeps the base ceiling when there is no video proof', () => {
    expect(
      resolveRegearClaimCeilingSilver({
        baseCeilingSilver: 1_000_000,
        videoCeilingBonusSilver: 500_000,
        hasVideoProof: false,
      }),
    ).toBe(1_000_000)
  })

  it('adds the video proof ceiling bonus when a video proof exists', () => {
    expect(
      resolveRegearClaimCeilingSilver({
        baseCeilingSilver: 1_000_000,
        videoCeilingBonusSilver: 500_000,
        hasVideoProof: true,
      }),
    ).toBe(1_500_000)
  })

  it('keeps the base ceiling when the video ceiling bonus is zero', () => {
    expect(
      resolveRegearClaimCeilingSilver({
        baseCeilingSilver: 1_000_000,
        videoCeilingBonusSilver: 0,
        hasVideoProof: true,
      }),
    ).toBe(1_000_000)
  })

  it('clamps the effective ceiling to a Postgres integer', () => {
    expect(
      resolveRegearClaimCeilingSilver({
        baseCeilingSilver: POSTGRES_INT_MAX - 10,
        videoCeilingBonusSilver: 100,
        hasVideoProof: true,
      }),
    ).toBe(POSTGRES_INT_MAX)
  })
})

describe('parseRegearVideoClaimCeilingBonusSilver', () => {
  it('accepts non-negative integer silver bonuses', () => {
    expect(parseRegearVideoClaimCeilingBonusSilver('0')).toBe(0)
    expect(parseRegearVideoClaimCeilingBonusSilver('500000')).toBe(500_000)
  })

  it('uses the fallback for invalid bonuses', () => {
    expect(parseRegearVideoClaimCeilingBonusSilver('-1', 0)).toBe(0)
    expect(parseRegearVideoClaimCeilingBonusSilver('1.5', 0)).toBe(0)
  })
})
