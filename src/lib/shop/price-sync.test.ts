import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AodpPriceKey, AodpPriceResult } from '@/lib/shop/aodp'
import { syncTenantShopPrices } from './price-sync'

const mocks = vi.hoisted(() => ({
  fetchAodpPrices: vi.fn(),
  loadAodpOptions: vi.fn(),
}))

vi.mock('@/lib/shop/aodp', () => ({
  fetchAodpPrices: mocks.fetchAodpPrices,
  loadAodpOptions: mocks.loadAodpOptions,
  inventoryKey: (uniqueName: string, enchant: number, quality: number) =>
    `${uniqueName}|${enchant}|${quality}`,
}))

function makePriceResult(key: AodpPriceKey, price: number): AodpPriceResult {
  return {
    uniqueName: key.uniqueName,
    enchant: key.enchant,
    quality: key.quality,
    price,
    city: 'Lymhurst',
    sampledAt: '2026-06-01T00:00:00.000Z',
    source: 'spot',
    usedQuality: key.quality,
    fallbackTier: 'exact',
    confidence: 'high',
    sampleCount: null,
  }
}

function createPriceSyncDb(
  rowCount: number,
  options: { rpcError?: { code?: string; message: string } } = {},
) {
  const rows = Array.from({ length: rowCount }, (_, i) => ({
    unique_name: `T4_ITEM_${i}`,
    enchant: i % 5,
    quality: (i % 5) + 1,
  }))
  const rangeCalls: Array<[number, number]> = []
  const rpcCalls: Array<{ name: string; args: { p_guild_id: string; p_updates: unknown[] } }> = []
  const updateCalls: unknown[] = []
  const query = {
    select: vi.fn(() => query),
    update: vi.fn((payload: unknown) => {
      updateCalls.push(payload)
      return query
    }),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn(async (from: number, to: number) => {
      rangeCalls.push([from, to])
      return { data: rows.slice(from, to + 1), error: null }
    }),
  }
  const from = vi.fn((table: string) => {
    if (table !== 'shop_inventory') throw new Error(`unexpected table: ${table}`)
    return query
  })
  const rpc = vi.fn(async (name: string, args: { p_guild_id: string; p_updates: unknown[] }) => {
    rpcCalls.push({ name, args })
    if (options.rpcError) return { data: null, error: options.rpcError }
    return { data: args.p_updates.length, error: null }
  })
  return { db: { from, rpc }, rows, rangeCalls, rpcCalls, updateCalls }
}

describe('syncTenantShopPrices', () => {
  beforeEach(() => {
    mocks.fetchAodpPrices.mockReset()
    mocks.loadAodpOptions.mockReset()
    mocks.loadAodpOptions.mockResolvedValue({
      cities: ['Lymhurst'],
      primaryCity: 'Lymhurst',
      server: 'west',
      mode: 'spot',
      minQuality: 4,
      qualityAgnostic: true,
    })
  })

  it('pages all inventory rows and applies price updates in RPC batches', async () => {
    const { db, rows, rangeCalls, rpcCalls } = createPriceSyncDb(1002)
    mocks.fetchAodpPrices.mockImplementation(async (keys: AodpPriceKey[]) => {
      const prices = new Map<string, AodpPriceResult>()
      for (const key of keys.slice(0, -1)) {
        prices.set(`${key.uniqueName}|${key.enchant}|${key.quality}`, makePriceResult(key, 1000))
      }
      return prices
    })

    await expect(
      syncTenantShopPrices(db as unknown as Parameters<typeof syncTenantShopPrices>[0], 'guild-1'),
    ).resolves.toEqual({
      requested: 1002,
      updated: 1001,
      missing: 1,
    })

    expect(rangeCalls).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(mocks.fetchAodpPrices).toHaveBeenCalledWith(
      rows.map((r) => ({
        uniqueName: r.unique_name,
        enchant: r.enchant,
        quality: 1,
      })),
      {
        cities: ['Lymhurst'],
        primaryCity: 'Lymhurst',
        server: 'west',
        mode: 'spot',
        minQuality: 1,
        qualityAgnostic: false,
      },
    )
    expect(rpcCalls.map((call) => [call.name, call.args.p_updates.length])).toEqual([
      ['apply_shop_inventory_price_updates', 500],
      ['apply_shop_inventory_price_updates', 500],
      ['apply_shop_inventory_price_updates', 1],
    ])
    expect(rpcCalls.every((call) => call.args.p_guild_id === 'guild-1')).toBe(true)
  })

  it('falls back to row-level updates when the batch RPC is not deployed yet', async () => {
    const { db, updateCalls, rpcCalls } = createPriceSyncDb(3, {
      rpcError: {
        code: 'PGRST202',
        message: 'Could not find the function public.apply_shop_inventory_price_updates',
      },
    })
    mocks.fetchAodpPrices.mockImplementation(async (keys: AodpPriceKey[]) => {
      const prices = new Map<string, AodpPriceResult>()
      for (const key of keys) {
        prices.set(`${key.uniqueName}|${key.enchant}|${key.quality}`, makePriceResult(key, 1000))
      }
      return prices
    })

    await expect(
      syncTenantShopPrices(db as unknown as Parameters<typeof syncTenantShopPrices>[0], 'guild-1'),
    ).resolves.toEqual({
      requested: 3,
      updated: 3,
      missing: 0,
    })

    expect(rpcCalls).toHaveLength(1)
    expect(updateCalls).toHaveLength(3)
  })
})
