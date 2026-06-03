import { describe, expect, it } from 'vitest'
import {
  hasBlockingShopOrderLineStockShortage,
  hasBlockingShopOrderStockShortage,
} from './order-approval'

describe('shop order approval stock checks', () => {
  it('does not block approval when the order already reserved stock at submit time', () => {
    const stockReservedAt = '2026-06-03T15:19:37.982954+00:00'

    expect(
      hasBlockingShopOrderStockShortage({
        stockReservedAt,
        items: [{ stockAvailable: 0, quantity: 1 }],
      }),
    ).toBe(false)
    expect(
      hasBlockingShopOrderLineStockShortage({
        stockReservedAt,
        item: { stockAvailable: 0, quantity: 1 },
      }),
    ).toBe(false)
  })

  it('still blocks legacy unreserved orders when current stock is short', () => {
    expect(
      hasBlockingShopOrderStockShortage({
        stockReservedAt: null,
        items: [{ stockAvailable: 0, quantity: 1 }],
      }),
    ).toBe(true)
    expect(
      hasBlockingShopOrderLineStockShortage({
        stockReservedAt: null,
        item: { stockAvailable: 0, quantity: 1 },
      }),
    ).toBe(true)
  })
})
