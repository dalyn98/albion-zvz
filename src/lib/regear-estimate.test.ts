import { describe, it, expect, vi } from 'vitest'

// `worstWarningLevel` only — pure function, no mocks needed. The full
// estimateSilverFromEquipment flow goes through AODP fetch + DB, which is
// covered by tracked-kills/integration tests rather than this unit suite.
vi.mock('@/lib/shop/aodp', () => ({
  fetchAodpPrices: vi.fn(),
  loadAodpOptions: vi.fn(),
}))

import { worstWarningLevel } from './regear-estimate'

describe('worstWarningLevel', () => {
  it('returns null when all tiers are exact or none', () => {
    expect(worstWarningLevel(['exact', 'exact'])).toBe(null)
    expect(worstWarningLevel(['none'])).toBe(null)
    expect(worstWarningLevel([])).toBe(null)
  })

  it('picks redzone over everything else', () => {
    expect(worstWarningLevel(['exact', 'quality', 'bluezone', 'redzone'])).toBe('redzone')
  })

  it('picks bluezone over window/quality', () => {
    expect(worstWarningLevel(['quality', 'window', 'bluezone'])).toBe('bluezone')
    expect(worstWarningLevel(['bluezone', 'window'])).toBe('bluezone')
  })

  it('picks window over quality', () => {
    expect(worstWarningLevel(['quality', 'window'])).toBe('window')
  })

  it('picks quality when only quality is present', () => {
    expect(worstWarningLevel(['exact', 'quality', 'none'])).toBe('quality')
  })

  it('ignores none and exact when ranking', () => {
    expect(worstWarningLevel(['none', 'window', 'exact'])).toBe('window')
  })
})
