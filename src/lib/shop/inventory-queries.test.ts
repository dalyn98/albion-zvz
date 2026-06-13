import { describe, expect, it, vi } from 'vitest'
import {
  findPublicShopCatalogSearchUniqueNames,
  loadPublicShopCatalogPageRows,
  loadShopInventoryPriceKeyRows,
  PUBLIC_SHOP_CATALOG_PAGE_SIZE,
  type PublicShopCatalogRow,
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

function createPublicCatalogDb(rows: PublicShopCatalogRow[]) {
  const rangeCalls: Array<[number, number]> = []
  const selectCalls: Array<[string, unknown]> = []
  const eqCalls: Array<[string, unknown]> = []
  const gtCalls: Array<[string, unknown]> = []
  const orderCalls: Array<[string, unknown]> = []
  const orCalls: string[] = []
  const query = {
    select: vi.fn((columns: string, options?: unknown) => {
      selectCalls.push([columns, options])
      return query
    }),
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push([column, value])
      return query
    }),
    gt: vi.fn((column: string, value: unknown) => {
      gtCalls.push([column, value])
      return query
    }),
    or: vi.fn((filter: string) => {
      orCalls.push(filter)
      return query
    }),
    order: vi.fn((column: string, options: unknown) => {
      orderCalls.push([column, options])
      return query
    }),
    range: vi.fn(async (from: number, to: number) => {
      rangeCalls.push([from, to])
      return { data: rows.slice(from, to + 1), error: null }
    }),
  }
  const from = vi.fn((table: string) => {
    if (table !== 'shop_inventory') throw new Error(`unexpected table: ${table}`)
    return query
  })
  return {
    db: { from },
    from,
    query,
    rangeCalls,
    selectCalls,
    eqCalls,
    gtCalls,
    orderCalls,
    orCalls,
  }
}

function catalogRow(id: string, patch: Partial<PublicShopCatalogRow> = {}): PublicShopCatalogRow {
  return {
    id,
    unique_name: `T8_2H_TEST_${id}`,
    enchant: 0,
    quality: 3,
    stock: 1,
    name_ko: `테스트 ${id}`,
    category: 'weapon',
    tier: 8,
    manual_price: 100,
    auto_price_silver: null,
    price_warning_level: null,
    ...patch,
  }
}

describe('loadPublicShopCatalogPageRows', () => {
  it('loads only the first public catalog page by default', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => catalogRow(String(i)))
    const { db, rangeCalls, selectCalls, eqCalls, gtCalls, orderCalls } =
      createPublicCatalogDb(rows)

    const result = await loadPublicShopCatalogPageRows(
      db as unknown as Parameters<typeof loadPublicShopCatalogPageRows>[0],
      { guildId: 'guild-1' },
    )

    expect(result.error).toBeUndefined()
    expect(result.rows).toHaveLength(PUBLIC_SHOP_CATALOG_PAGE_SIZE)
    expect(result.page).toBe(1)
    expect(result.total).toBe(PUBLIC_SHOP_CATALOG_PAGE_SIZE)
    expect(result.isTotalApproximate).toBe(true)
    expect(result.hasMore).toBe(true)
    expect(rangeCalls).toEqual([[0, PUBLIC_SHOP_CATALOG_PAGE_SIZE]])
    expect(selectCalls[0][1]).toBeUndefined()
    expect(eqCalls).toContainEqual(['guild_id', 'guild-1'])
    expect(gtCalls).toContainEqual(['stock', 0])
    expect(orderCalls.map(([column]) => column)).toEqual(['category', 'name_ko', 'id'])
  })

  it('applies page, tier, and localized search filters without full pagination', async () => {
    const rows = Array.from({ length: 260 }, (_, i) => catalogRow(String(i)))
    const { db, rangeCalls, eqCalls, orCalls } = createPublicCatalogDb(rows)

    const result = await loadPublicShopCatalogPageRows(
      db as unknown as Parameters<typeof loadPublicShopCatalogPageRows>[0],
      { guildId: 'guild-1', page: 3, tier: 8, query: 'infernal' },
    )

    expect(result.rows).toHaveLength(PUBLIC_SHOP_CATALOG_PAGE_SIZE * 3)
    expect(result.page).toBe(3)
    expect(result.hasMore).toBe(true)
    expect(result.isTotalApproximate).toBe(true)
    expect(rangeCalls).toEqual([[0, 240]])
    expect(eqCalls).toContainEqual(['tier', 8])
    expect(orCalls).toHaveLength(1)
    expect(orCalls[0]).toContain('name_ko.ilike.*infernal*')
    expect(orCalls[0]).toContain('unique_name.ilike.*infernal*')
    expect(orCalls[0]).toContain('unique_name.in.')
  })

  it('applies tier-enchant search tokens as DB filters and searches the remaining text', async () => {
    const rows = [catalogRow('demonfang')]
    const { db, eqCalls, orCalls } = createPublicCatalogDb(rows)

    await loadPublicShopCatalogPageRows(
      db as unknown as Parameters<typeof loadPublicShopCatalogPageRows>[0],
      { guildId: 'guild-1', query: '7.3 데몬팽' },
    )

    expect(eqCalls).toContainEqual(['tier', 7])
    expect(eqCalls).toContainEqual(['enchant', 3])
    expect(orCalls).toHaveLength(1)
    expect(orCalls[0]).toContain('name_ko.ilike.*데몬팽*')
    expect(orCalls[0]).not.toContain('7.3')
  })

  it('can search by tier-enchant token alone', async () => {
    const rows = [catalogRow('facebreaker')]
    const { db, eqCalls, orCalls } = createPublicCatalogDb(rows)

    await loadPublicShopCatalogPageRows(
      db as unknown as Parameters<typeof loadPublicShopCatalogPageRows>[0],
      { guildId: 'guild-1', query: 'T7.3' },
    )

    expect(eqCalls).toContainEqual(['tier', 7])
    expect(eqCalls).toContainEqual(['enchant', 3])
    expect(orCalls).toEqual([])
  })

  it('does not mark total as approximate when the extra row is absent', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => catalogRow(String(i)))
    const { db } = createPublicCatalogDb(rows)

    const result = await loadPublicShopCatalogPageRows(
      db as unknown as Parameters<typeof loadPublicShopCatalogPageRows>[0],
      { guildId: 'guild-1' },
    )

    expect(result.rows).toHaveLength(60)
    expect(result.total).toBe(60)
    expect(result.isTotalApproximate).toBe(false)
    expect(result.hasMore).toBe(false)
  })
})

describe('findPublicShopCatalogSearchUniqueNames', () => {
  it('matches bundled Albion item names across locales', () => {
    const matches = findPublicShopCatalogSearchUniqueNames('infernal', 20)

    expect(matches.length).toBeGreaterThan(0)
    expect(matches.some((uniqueName) => uniqueName.includes('_HELL'))).toBe(true)
  })
})
