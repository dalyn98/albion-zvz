import { describe, expect, it } from 'vitest'
import {
  canOpenManualRegearRequest,
  getDeathBatchEntryLimit,
  getEntryLimitForRequestType,
  getRemainingDeathClaims,
  isDeathLimitReached,
} from './regear-request-policy'

describe('manual regear request policy', () => {
  it('counts only death claims against the death limit', () => {
    expect(getRemainingDeathClaims(2, 3)).toBe(1)
    expect(isDeathLimitReached(3, 3)).toBe(true)
    expect(getEntryLimitForRequestType('overcharge', 3, 3)).toBe(1)
  })

  it('allows opening the request flow at the death limit when overcharge is enabled', () => {
    expect(
      canOpenManualRegearRequest({
        baseEnabled: true,
        activeDeathCount: 3,
        maxDeaths: 3,
        overchargeEnabled: true,
      }),
    ).toBe(true)
  })

  it('blocks the request flow at the death limit when overcharge is disabled', () => {
    expect(
      canOpenManualRegearRequest({
        baseEnabled: true,
        activeDeathCount: 3,
        maxDeaths: 3,
        overchargeEnabled: false,
      }),
    ).toBe(false)
  })

  it('caps death batch choices by remaining deaths and the product batch max', () => {
    expect(getDeathBatchEntryLimit(0, 5)).toBe(3)
    expect(getDeathBatchEntryLimit(2, 3)).toBe(1)
  })
})
