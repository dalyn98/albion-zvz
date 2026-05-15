import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: vi.fn(),
}))

import { getGearCatalog, TIER_LEVELS, ENCHANT_LEVELS } from './inventory-catalog'

describe('getGearCatalog', () => {
  const catalog = getGearCatalog()

  it('returns a non-empty list of base equipment entries', () => {
    expect(catalog.length).toBeGreaterThan(100)
  })

  it('contains only T4–T8 entries', () => {
    for (const e of catalog) {
      expect(e.tier).toBeGreaterThanOrEqual(4)
      expect(e.tier).toBeLessThanOrEqual(8)
    }
  })

  it('excludes capes and bags (slot-level exclusion)', () => {
    expect(catalog.some((e) => e.slot === 'cape')).toBe(false)
    expect(catalog.some((e) => e.slot === 'bag')).toBe(false)
  })

  it('excludes "other" slot entries', () => {
    expect(catalog.some((e) => e.slot === 'other')).toBe(false)
  })

  it('excludes enchanted variants (no @N in baseItemId)', () => {
    expect(catalog.every((e) => !e.baseItemId.includes('@'))).toBe(true)
  })

  it('excludes the IRONGAUNTLETS_HELL legacy pattern', () => {
    expect(catalog.some((e) => /IRONGAUNTLETS_HELL/.test(e.baseItemId))).toBe(false)
  })

  it('returns the same reference on repeated calls (cached)', () => {
    const a = getGearCatalog()
    const b = getGearCatalog()
    expect(a).toBe(b)
  })

  it('attaches armor material on armor pieces', () => {
    const plate = catalog.find((e) => e.slot === 'head' && /PLATE/.test(e.baseItemId))
    expect(plate?.armorMaterial).toBe('PLATE')
    const cloth = catalog.find((e) => e.slot === 'shoes' && /CLOTH/.test(e.baseItemId))
    expect(cloth?.armorMaterial).toBe('CLOTH')
  })

  it('exposes T4–T8 tier list and 0–4 enchant levels as constants', () => {
    expect([...TIER_LEVELS]).toEqual([4, 5, 6, 7, 8])
    expect([...ENCHANT_LEVELS]).toEqual([0, 1, 2, 3, 4])
  })
})
