import { describe, expect, it } from 'vitest'
import {
  parseRegearVideoClaimCeilingRatePercent,
  resolveRegearClaimCeilingSilver,
} from './regear-claim-ceiling'

describe('resolveRegearClaimCeilingSilver', () => {
  it('keeps the base ceiling when there is no video proof', () => {
    expect(
      resolveRegearClaimCeilingSilver({
        baseCeilingSilver: 1_000_000,
        videoCeilingRatePercent: 150,
        hasVideoProof: false,
      }),
    ).toBe(1_000_000)
  })

  it('applies the video proof ceiling rate when a video proof exists', () => {
    expect(
      resolveRegearClaimCeilingSilver({
        baseCeilingSilver: 1_000_000,
        videoCeilingRatePercent: 150,
        hasVideoProof: true,
      }),
    ).toBe(1_500_000)
  })

  it('falls back to the base ceiling when the video ceiling rate is malformed', () => {
    expect(
      resolveRegearClaimCeilingSilver({
        baseCeilingSilver: 1_000_000,
        videoCeilingRatePercent: 0,
        hasVideoProof: true,
      }),
    ).toBe(1_000_000)
  })
})

describe('parseRegearVideoClaimCeilingRatePercent', () => {
  it('accepts integer rates from 1 to 300 percent', () => {
    expect(parseRegearVideoClaimCeilingRatePercent('1')).toBe(1)
    expect(parseRegearVideoClaimCeilingRatePercent('300')).toBe(300)
  })

  it('uses the fallback for invalid rates', () => {
    expect(parseRegearVideoClaimCeilingRatePercent('301', 100)).toBe(100)
    expect(parseRegearVideoClaimCeilingRatePercent('1.5', 100)).toBe(100)
  })
})
