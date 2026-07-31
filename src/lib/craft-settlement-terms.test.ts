import { describe, expect, it } from 'vitest'
import {
  calculateCraftSettlementTerms,
  quoteCraftMaterialValue,
} from './craft-settlement-terms'

describe('craft settlement terms', () => {
  it('keeps material source and craft fee independent across all four combinations', () => {
    const common = { quotedMaterialValueSilver: 100_000, craftFeePct: 10 }
    expect(calculateCraftSettlementTerms({
      ...common,
      materialSource: 'guild_stock',
      craftFeeMode: 'none',
    })).toMatchObject({ materialReimbursementSilver: 0, craftFeeSilver: 0, settlementTotalSilver: 0 })
    expect(calculateCraftSettlementTerms({
      ...common,
      materialSource: 'crafter_purchase',
      craftFeeMode: 'none',
    })).toMatchObject({ materialReimbursementSilver: 100_000, craftFeeSilver: 0, settlementTotalSilver: 100_000 })
    expect(calculateCraftSettlementTerms({
      ...common,
      materialSource: 'crafter_purchase',
      craftFeeMode: 'configured',
    })).toMatchObject({ materialReimbursementSilver: 100_000, craftFeeSilver: 10_000, settlementTotalSilver: 110_000 })
    expect(calculateCraftSettlementTerms({
      ...common,
      materialSource: 'guild_stock',
      craftFeeMode: 'configured',
    })).toMatchObject({ materialReimbursementSilver: 0, craftFeeSilver: 10_000, settlementTotalSilver: 10_000 })
  })

  it('quotes only approved fulfillment slots from the immutable line snapshot', () => {
    expect(quoteCraftMaterialValue({
      items: [
        { slot: 'weapon', price: 80_000, count: 1 },
        { slot: 'head', price: 20_000, count: 2 },
        { slot: 'cape', price: 50_000, count: 1 },
      ],
    }, ['weapon', 'head'])).toBe(120_000)
  })
})
