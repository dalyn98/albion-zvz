import { describe, expect, it } from 'vitest'
import { formatShopTierEnchantLabel } from './catalog-display'

describe('formatShopTierEnchantLabel', () => {
  it('keeps the flat suffix visible for tiered items', () => {
    expect(formatShopTierEnchantLabel({ tier: 8, enchant: 0 })).toBe('8.0')
    expect(formatShopTierEnchantLabel({ tier: 6, enchant: 3 })).toBe('6.3')
  })

  it('shows the flat marker for untiered special items instead of a dash', () => {
    expect(formatShopTierEnchantLabel({ tier: null, enchant: 0 })).toBe('0')
  })

  it('shows untiered enchanted special items without hiding the enchant', () => {
    expect(formatShopTierEnchantLabel({ tier: null, enchant: 2 })).toBe('+2')
  })
})
