import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importChestLog } from './shop-admin'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getTranslations: vi.fn(),
  requireAnyCapability: vi.fn(),
  getAppSetting: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  getLogOperatingStart: vi.fn(),
  parseChestLog: vi.fn(),
  resolveKoItem: vi.fn(),
  logAdminAction: vi.fn(),
  syncShopPrices: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}))

vi.mock('@/lib/auth', () => ({
  requireAnyCapability: mocks.requireAnyCapability,
}))

vi.mock('@/lib/app-settings', () => ({
  getAppSetting: mocks.getAppSetting,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminAction,
}))

vi.mock('@/lib/log-operating-start-server', () => ({
  getLogOperatingStart: mocks.getLogOperatingStart,
}))

vi.mock('@/lib/shop/parse-chest-log', () => ({
  parseChestLog: mocks.parseChestLog,
}))

vi.mock('@/lib/shop/resolve-item', () => ({
  resolveKoItem: mocks.resolveKoItem,
}))

vi.mock('./shop-inventory', () => ({
  syncShopPrices: mocks.syncShopPrices,
}))

function createImportDb(options: {
  batchStockError?: { code?: string; message: string }
  insertResults?: Array<{ error: { code?: string; message: string } | null }>
} = {}) {
  const blacklistQuery = {
    select: vi.fn(() => blacklistQuery),
    eq: vi.fn().mockResolvedValue({ data: [], error: null }),
  }
  const existingLogQuery = {
    select: vi.fn(() => existingLogQuery),
    eq: vi.fn(() => existingLogQuery),
    gte: vi.fn(() => existingLogQuery),
    lte: vi.fn(() => existingLogQuery),
    order: vi.fn(() => existingLogQuery),
    range: vi.fn().mockResolvedValue({ data: [], error: null }),
  }
  const latestLogQuery = {
    select: vi.fn(() => latestLogQuery),
    eq: vi.fn(() => latestLogQuery),
    order: vi.fn(() => latestLogQuery),
    limit: vi.fn(() => latestLogQuery),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  const insertResults = [...(options.insertResults ?? [{ error: null }])]
  const insertCalls: unknown[][] = []
  const createInsertLogQuery = () => ({
    insert: vi.fn((rows: unknown[]) => {
      insertCalls.push(rows)
      const next = insertResults.shift() ?? { error: null }
      return Promise.resolve(next)
    }),
  })
  const inventoryQuery = {
    select: vi.fn(() => inventoryQuery),
    eq: vi.fn(() => inventoryQuery),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
  }
  let chestLogReadCount = 0
  const from = vi.fn((table: string) => {
    if (table === 'shop_blacklist') return blacklistQuery
    if (table === 'shop_inventory') return inventoryQuery
    if (table === 'shop_chest_logs') {
      if (chestLogReadCount === 0) {
        chestLogReadCount += 1
        return existingLogQuery
      }
      if (chestLogReadCount === 1) {
        chestLogReadCount += 1
        return latestLogQuery
      }
      return createInsertLogQuery()
    }
    throw new Error(`Unexpected table: ${table}`)
  })
  const rpc = vi.fn((fn: string) => {
    if (fn === 'apply_shop_stock_deltas') {
      return Promise.resolve({ error: options.batchStockError ?? null })
    }
    if (fn === 'apply_shop_stock_delta') {
      return Promise.resolve({ error: null })
    }
    throw new Error(`Unexpected RPC: ${fn}`)
  })
  return {
    db: { from, rpc },
    from,
    rpc,
    insertCalls,
    existingLogQuery,
    inventoryQuery,
  }
}

describe('importChestLog', () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset()
    mocks.getTranslations.mockReset()
    mocks.requireAnyCapability.mockReset()
    mocks.getAppSetting.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.getLogOperatingStart.mockReset()
    mocks.parseChestLog.mockReset()
    mocks.resolveKoItem.mockReset()
    mocks.logAdminAction.mockReset()
    mocks.syncShopPrices.mockReset()

    mocks.getTranslations.mockResolvedValue((key: string) => key)
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAppSetting.mockResolvedValue('')
    mocks.getLogOperatingStart.mockResolvedValue(null)
  })

  it('applies stock updates without waiting for AODP price sync', async () => {
    const { db, from, rpc, insertCalls, inventoryQuery } = createImportDb()
    const loggedAt = new Date('2026-05-01T00:00:00.000Z')
    mocks.requireAnyCapability.mockResolvedValue(db)
    mocks.parseChestLog.mockReturnValue({
      entries: [
        {
          loggedAt,
          player: 'PlayerOne',
          itemName: '테스트 장비',
          enchant: 0,
          quality: 1,
          quantity: 2,
        },
      ],
      errors: [],
    })
    mocks.resolveKoItem.mockReturnValue({
      uniqueName: 'T4_TEST_ITEM',
      category: 'armor',
      nameKo: '테스트 장비',
      tier: 4,
    })

    const result = await importChestLog('raw chest log')

    expect(result.error).toBeUndefined()
    expect(result).toMatchObject({
      parsed: 1,
      inserted: 1,
      duplicatesSkipped: 0,
      stockChanges: [
        {
          uniqueName: 'T4_TEST_ITEM',
          nameKo: '테스트 장비',
          enchant: 0,
          quality: 1,
          delta: 2,
          newStock: 2,
        },
      ],
    })
    expect('priceSync' in result).toBe(false)
    expect(mocks.syncShopPrices).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('shop_inventory')
    expect(inventoryQuery.in).toHaveBeenCalledWith('unique_name', ['T4_TEST_ITEM'])
    expect(insertCalls).toEqual([[
      {
        guild_id: 'guild-1',
        logged_at: '2026-05-01T00:00:00.000Z',
        import_sequence: 0,
        player: 'PlayerOne',
        item_name_raw: '테스트 장비',
        enchant: 0,
        quality: 1,
        quantity: 2,
        unique_name: 'T4_TEST_ITEM',
        imported_by: 'admin-1',
      },
    ]])
    expect(rpc).toHaveBeenCalledWith('apply_shop_stock_deltas', {
      p_guild_id: 'guild-1',
      p_deltas: [
        {
          unique_name: 'T4_TEST_ITEM',
          enchant: 0,
          quality: 1,
          delta: 2,
          name_ko: '테스트 장비',
          category: 'armor',
          tier: 4,
        },
      ],
    })
    expect(rpc).not.toHaveBeenCalledWith('apply_shop_stock_delta', expect.anything())
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/shop')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/shop')
    expect(mocks.logAdminAction).toHaveBeenCalledWith({
      guildId: 'guild-1',
      adminDiscordId: 'admin-1',
      action: 'shop.item.update',
      targetKind: 'shop_item',
      details: {
        kind: 'chest.import',
        inserted: 1,
        duplicatesSkipped: 0,
        skippedBeforeStart: 0,
        stockChanges: 1,
        tierEnchantExcludedRows: 0,
        unresolvedRows: 0,
      },
    })
  })

  it('falls back to per-row stock RPC while the batch migration is not applied', async () => {
    const { db, rpc } = createImportDb({
      batchStockError: {
        code: 'PGRST202',
        message: 'Could not find the function public.apply_shop_stock_deltas in the schema cache',
      },
    })
    const loggedAt = new Date('2026-05-01T00:00:00.000Z')
    mocks.requireAnyCapability.mockResolvedValue(db)
    mocks.parseChestLog.mockReturnValue({
      entries: [
        {
          loggedAt,
          player: 'PlayerOne',
          itemName: '테스트 장비',
          enchant: 0,
          quality: 1,
          quantity: 2,
        },
      ],
      errors: [],
    })
    mocks.resolveKoItem.mockReturnValue({
      uniqueName: 'T4_TEST_ITEM',
      category: 'armor',
      nameKo: '테스트 장비',
      tier: 4,
    })

    const result = await importChestLog('raw chest log')

    expect(result.error).toBeUndefined()
    expect(result.inserted).toBe(1)
    expect(rpc).toHaveBeenCalledWith('apply_shop_stock_deltas', expect.anything())
    expect(rpc).toHaveBeenCalledWith('apply_shop_stock_delta', {
      p_guild_id: 'guild-1',
      p_unique_name: 'T4_TEST_ITEM',
      p_enchant: 0,
      p_quality: 1,
      p_delta: 2,
      p_name_ko: '테스트 장비',
      p_category: 'armor',
      p_tier: 4,
    })
  })

  it('applies stock only for rows actually inserted after a duplicate batch conflict', async () => {
    const duplicateError = {
      code: '23505',
      message: 'duplicate key value violates unique constraint',
    }
    const { db, rpc, insertCalls } = createImportDb({
      insertResults: [
        { error: duplicateError },
        { error: duplicateError },
        { error: null },
      ],
    })
    const firstLoggedAt = new Date('2026-05-01T00:00:00.000Z')
    const secondLoggedAt = new Date('2026-05-01T00:00:01.000Z')
    mocks.requireAnyCapability.mockResolvedValue(db)
    mocks.parseChestLog.mockReturnValue({
      entries: [
        {
          loggedAt: firstLoggedAt,
          player: 'PlayerOne',
          itemName: '테스트 장비',
          enchant: 0,
          quality: 1,
          quantity: 2,
        },
        {
          loggedAt: secondLoggedAt,
          player: 'PlayerOne',
          itemName: '테스트 장비',
          enchant: 0,
          quality: 1,
          quantity: 5,
        },
      ],
      errors: [],
    })
    mocks.resolveKoItem.mockReturnValue({
      uniqueName: 'T4_TEST_ITEM',
      category: 'armor',
      nameKo: '테스트 장비',
      tier: 4,
    })

    const result = await importChestLog('raw chest log')

    expect(result.error).toBeUndefined()
    expect(result).toMatchObject({
      parsed: 2,
      inserted: 1,
      duplicatesSkipped: 1,
      stockChanges: [
        {
          uniqueName: 'T4_TEST_ITEM',
          delta: 5,
          newStock: 5,
        },
      ],
    })
    expect(insertCalls).toHaveLength(3)
    expect(insertCalls[0]).toHaveLength(2)
    expect(insertCalls[1]).toHaveLength(1)
    expect(insertCalls[2]).toHaveLength(1)
    expect(rpc).toHaveBeenCalledWith('apply_shop_stock_deltas', {
      p_guild_id: 'guild-1',
      p_deltas: [
        {
          unique_name: 'T4_TEST_ITEM',
          enchant: 0,
          quality: 1,
          delta: 5,
          name_ko: '테스트 장비',
          category: 'armor',
          tier: 4,
        },
      ],
    })
    expect(mocks.logAdminAction).toHaveBeenCalledWith({
      guildId: 'guild-1',
      adminDiscordId: 'admin-1',
      action: 'shop.item.update',
      targetKind: 'shop_item',
      details: {
        kind: 'chest.import',
        inserted: 1,
        duplicatesSkipped: 1,
        skippedBeforeStart: 0,
        stockChanges: 1,
        tierEnchantExcludedRows: 0,
        unresolvedRows: 0,
      },
    })
  })
})
