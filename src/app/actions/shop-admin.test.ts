import { beforeEach, describe, expect, it, vi } from 'vitest'
import { importChestLog, resetShopChestLogs } from './shop-admin'

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

function createDeleteQuery(result: { count: number | null; error: { message: string } | null }) {
  const eq = vi.fn().mockResolvedValue(result)
  const deleteFn = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ delete: deleteFn }))
  return { db: { from }, from, deleteFn, eq }
}

function createImportDb(options: { batchStockError?: { code?: string; message: string } } = {}) {
  const blacklistQuery = {
    select: vi.fn(() => blacklistQuery),
    eq: vi.fn().mockResolvedValue({ data: [], error: null }),
  }
  const existingLogQuery = {
    select: vi.fn(() => existingLogQuery),
    eq: vi.fn(() => existingLogQuery),
    gte: vi.fn(() => existingLogQuery),
    lte: vi.fn().mockResolvedValue({ data: [], error: null }),
  }
  const latestLogQuery = {
    select: vi.fn(() => latestLogQuery),
    eq: vi.fn(() => latestLogQuery),
    order: vi.fn(() => latestLogQuery),
    limit: vi.fn(() => latestLogQuery),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  }
  const insertLogQuery = {
    insert: vi.fn().mockResolvedValue({ error: null }),
  }
  const inventoryQuery = {
    select: vi.fn(() => inventoryQuery),
    eq: vi.fn(() => inventoryQuery),
    in: vi.fn().mockResolvedValue({ data: [], error: null }),
  }
  const chestLogQueries = [existingLogQuery, latestLogQuery, insertLogQuery]
  const from = vi.fn((table: string) => {
    if (table === 'shop_blacklist') return blacklistQuery
    if (table === 'shop_inventory') return inventoryQuery
    if (table === 'shop_chest_logs') {
      const query = chestLogQueries.shift()
      if (!query) throw new Error('Unexpected shop_chest_logs query')
      return query
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
    insertLogQuery,
    inventoryQuery,
  }
}

describe('resetShopChestLogs', () => {
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
  })

  it('requires an authenticated shop log admin', async () => {
    mocks.getSession.mockResolvedValue(null)

    await expect(resetShopChestLogs()).resolves.toEqual({
      deletedRows: 0,
      error: 'Unauthorized',
    })
    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })

  it('deletes only current guild shop chest logs and writes an audit entry', async () => {
    const { db, from, deleteFn, eq } = createDeleteQuery({
      count: 3,
      error: null,
    })
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(resetShopChestLogs()).resolves.toEqual({ deletedRows: 3 })

    expect(mocks.requireAnyCapability).toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('shop_chest_logs')
    expect(deleteFn).toHaveBeenCalledWith({ count: 'exact' })
    expect(eq).toHaveBeenCalledWith('guild_id', 'guild-1')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/shop')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/shop')
    expect(mocks.logAdminAction).toHaveBeenCalledWith({
      guildId: 'guild-1',
      adminDiscordId: 'admin-1',
      action: 'shop.item.update',
      targetKind: 'shop_item',
      details: {
        kind: 'chest_logs.reset',
        deletedRows: 3,
      },
    })
  })

  it('returns the database error without audit or revalidation', async () => {
    const { db } = createDeleteQuery({
      count: null,
      error: { message: 'db down' },
    })
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(resetShopChestLogs()).resolves.toEqual({
      deletedRows: 0,
      error: 'db down',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })
})

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
    const { db, from, rpc, insertLogQuery, inventoryQuery } = createImportDb()
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
    expect(insertLogQuery.insert).toHaveBeenCalledWith([
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
    ])
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
})
