import { describe, expect, it } from 'vitest'
import {
  isRegearFulfillmentMode,
  parseRegearFulfillmentMode,
  parseRegearSupportState,
  resolveRegearSupportConfiguration,
} from './regear-support'

describe('regear support configuration', () => {
  it('keeps a missing support choice distinct for onboarding', () => {
    expect(parseRegearSupportState(undefined)).toBe('unconfigured')
    expect(parseRegearSupportState('')).toBe('unconfigured')
    expect(parseRegearSupportState('unexpected')).toBe('unconfigured')
  })

  it('maps explicit support choices', () => {
    expect(parseRegearSupportState('true')).toBe('supported')
    expect(parseRegearSupportState('false')).toBe('unsupported')
  })

  it('only exposes a fulfillment mode to supported guilds', () => {
    expect(resolveRegearSupportConfiguration({
      supportRaw: 'false',
      craftRegearEnabledRaw: 'true',
    })).toEqual({
      state: 'unsupported',
      supported: false,
      fulfillmentMode: null,
    })
    expect(resolveRegearSupportConfiguration({
      supportRaw: 'true',
      craftRegearEnabledRaw: 'true',
    })).toEqual({
      state: 'supported',
      supported: true,
      fulfillmentMode: 'crafted',
    })
  })

  it('uses silver as the supported legacy fulfillment default', () => {
    expect(parseRegearFulfillmentMode(undefined)).toBe('silver')
    expect(parseRegearFulfillmentMode('false')).toBe('silver')
    expect(parseRegearFulfillmentMode('true')).toBe('crafted')
  })

  it('validates fulfillment choices strictly', () => {
    expect(isRegearFulfillmentMode('silver')).toBe(true)
    expect(isRegearFulfillmentMode('crafted')).toBe(true)
    expect(isRegearFulfillmentMode('unsupported')).toBe(false)
    expect(isRegearFulfillmentMode(null)).toBe(false)
  })
})
