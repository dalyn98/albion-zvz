import { describe, expect, it, vi } from 'vitest'
import {
  loadShopInventoryPriceKeyRows,
  type ShopInventoryPriceKeyRow,
} from './inventory-queries'

function createInventoryDb(pages: ShopInventoryPriceKeyRow[][]) {
  const rangeCalls: Array<[number, number]> = []
  const orderCalls: Array<[string, unknown]> = []
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn((column: string, options: unknown) => {
      orderCalls.push([column, options])
      return query
    }),
    range: vi.fn(async (from: number, to: number) => {
      rangeCalls.push([from, to])
      return { data: pages[Math.floor(from / 1000)] ?? [], error: null }
    }),
  }
  const from = vi.fn((table: string) => {
    if (table !== 'shop_inventory') throw new Error(`unexpected table: ${table}`)
    return query
  })
  return { db: { from }, from, query, rangeCalls, orderCalls }
}

describe('shop inventory paged queries', () => {
  it('loads shop inventory rows beyond the first 1000-row page', async () => {
    const firstPage = Array.from(
      { length: 1000 },
      (_, i): ShopInventoryPriceKeyRow => ({
        unique_name: `T4_ITEM_${i}`,
        enchant: 0,
        quality: 1,
      }),
    )
    const secondPage: ShopInventoryPriceKeyRow[] = [
      { unique_name: 'T4_ITEM_1000', enchant: 1, quality: 2 },
    ]
    const { db, rangeCalls, orderCalls } = createInventoryDb([firstPage, secondPage])

    const result = await loadShopInventoryPriceKeyRows(
      db as unknown as Parameters<typeof loadShopInventoryPriceKeyRows>[0],
      'guild-1',
    )

    expect(result.error).toBeUndefined()
    expect(result.rows).toHaveLength(1001)
    expect(rangeCalls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(orderCalls.map(([column]) => column)).toEqual([
      'unique_name',
      'enchant',
      'quality',
      'unique_name',
      'enchant',
      'quality',
    ])
  })
})
