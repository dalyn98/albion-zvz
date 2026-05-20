import { describe, it, expect } from 'vitest'
import { isSiphonItemName, SIPHON_CANONICAL_DISPLAY_NAME } from './siphon-items'

describe('isSiphonItemName', () => {
  it('matches canonical English name', () => {
    expect(isSiphonItemName('Siphoned Energy')).toBe(true)
    expect(isSiphonItemName('siphoned energy')).toBe(true)
    expect(isSiphonItemName('  SIPHONED ENERGY  ')).toBe(true)
  })

  it('matches Korean / Japanese / Chinese variants', () => {
    expect(isSiphonItemName('착취한 에너지')).toBe(true)
    expect(isSiphonItemName('サイフォンエネルギー')).toBe(true)
    expect(isSiphonItemName('虹吸能量')).toBe(true)
  })

  it('matches German / French / Russian / Polish / Spanish / Portuguese', () => {
    expect(isSiphonItemName('Gesammelte Energie')).toBe(true)
    expect(isSiphonItemName('Énergie siphonnée')).toBe(true)
    expect(isSiphonItemName('Выкачанная энергия')).toBe(true)
    expect(isSiphonItemName('Wyssana energia')).toBe(true)
    expect(isSiphonItemName('Energía embotellada')).toBe(true)
    expect(isSiphonItemName('Energia engarrafada')).toBe(true)
  })

  it('matches the raw UniqueName fallback', () => {
    expect(isSiphonItemName('UNIQUE_GVGTOKEN_GENERIC')).toBe(true)
    expect(isSiphonItemName('unique_gvgtoken_generic')).toBe(true)
  })

  it('rejects empty / whitespace input', () => {
    expect(isSiphonItemName('')).toBe(false)
    expect(isSiphonItemName('   ')).toBe(false)
  })

  it('rejects unrelated item names', () => {
    expect(isSiphonItemName('헤기물')).toBe(false)
    expect(isSiphonItemName('Silver')).toBe(false)
    expect(isSiphonItemName('Tome of Insight')).toBe(false)
    expect(isSiphonItemName('UNIQUE_GVGTOKEN_SOMETHING_ELSE')).toBe(false)
  })

  it('exposes the canonical display name', () => {
    expect(SIPHON_CANONICAL_DISPLAY_NAME).toBe('Siphoned Energy')
  })
})
