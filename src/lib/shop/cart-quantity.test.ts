import { describe, expect, it } from 'vitest'

import {
  applyShopCartQuantityDelta,
  normalizeShopCartQuantityInput,
} from './cart-quantity'

describe('shop cart quantity helpers', () => {
  it('accepts direct bulk quantities for consumable-sized orders', () => {
    expect(normalizeShopCartQuantityInput('125', 500)).toBe(125)
  })

  it('accepts comma-formatted quantity input and clamps to stock', () => {
    expect(normalizeShopCartQuantityInput('1,250', 999)).toBe(999)
  })

  it('rejects empty or non-positive quantity input', () => {
    expect(normalizeShopCartQuantityInput('', 500)).toBeNull()
    expect(normalizeShopCartQuantityInput('0', 500)).toBeNull()
    expect(normalizeShopCartQuantityInput('-5', 500)).toBeNull()
  })

  it('applies quick quantity deltas without crossing cart boundaries', () => {
    expect(applyShopCartQuantityDelta(1, 10, 500)).toBe(11)
    expect(applyShopCartQuantityDelta(480, 50, 500)).toBe(500)
    expect(applyShopCartQuantityDelta(8, -50, 500)).toBe(0)
  })
})
