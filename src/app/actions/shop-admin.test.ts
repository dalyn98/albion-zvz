import { beforeEach, describe, expect, it, vi } from 'vitest'
import { approveShopOrder, importChestLog, listShopOrders } from './shop-admin'

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
  getPointBalancesByMember: vi.fn(),
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

vi.mock('@/lib/point-ledger', () => ({
  getPointBalancesByMember: mocks.getPointBalancesByMember,
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
  approvedOrders?: Array<{
    id: string
    created_at: string
    stock_reserved_at?: string | null
    resolved_at: string | null
  }>
  orderItems?: Array<{
    id: string
    order_id: string
    unique_name: string
    enchant: number
    quality: number
    quantity: number
  }>
  fulfilledLogs?: Array<{
    matched_order_item_id: string | null
    ignored_quantity: number | null
    matched_order_items: unknown
  }>
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
  const approvedOrdersQuery = {
    select: vi.fn(() => approvedOrdersQuery),
    eq: vi.fn(() => approvedOrdersQuery),
    not: vi.fn(() => approvedOrdersQuery),
    order: vi.fn(() => approvedOrdersQuery),
    limit: vi.fn().mockResolvedValue({
      data: options.approvedOrders ?? [],
      error: null,
    }),
  }
  const orderItemsQuery = {
    select: vi.fn(() => orderItemsQuery),
    eq: vi.fn(() => orderItemsQuery),
    in: vi.fn((column: string) => {
      if (column === 'unique_name') {
        return Promise.resolve({ data: options.orderItems ?? [], error: null })
      }
      return orderItemsQuery
    }),
  }
  const fulfilledLogsQuery = {
    select: vi.fn(() => fulfilledLogsQuery),
    eq: vi.fn((column: string) => {
      if (column === 'ignored_reason') {
        return Promise.resolve({ data: options.fulfilledLogs ?? [], error: null })
      }
      return fulfilledLogsQuery
    }),
  }
  let chestLogReadCount = 0
  const from = vi.fn((table: string) => {
    if (table === 'shop_blacklist') return blacklistQuery
    if (table === 'shop_inventory') return inventoryQuery
    if (table === 'shop_orders') return approvedOrdersQuery
    if (table === 'shop_order_items') return orderItemsQuery
    if (table === 'shop_chest_logs') {
      if (chestLogReadCount === 0) {
        chestLogReadCount += 1
        return existingLogQuery
      }
      if (chestLogReadCount === 1) {
        chestLogReadCount += 1
        return latestLogQuery
      }
      if (options.fulfilledLogs && chestLogReadCount === 2) {
        chestLogReadCount += 1
        return fulfilledLogsQuery
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

function createListOrdersDb() {
  const orderRows = [
    {
      id: 'order-1',
      discord_id: 'member-1',
      username: 'MemberOne',
      total_points: 100,
      price_review_required: true,
      stock_reserved_at: '2026-06-03T00:00:00.000Z',
      status: 'pending',
      member_note: null,
      admin_note: null,
      pickup_note: 'Guild chest tab 2',
      created_at: '2026-06-03T00:00:00.000Z',
      resolved_at: null,
      resolved_by: null,
    },
  ]
  const orderQuery = {
    select: vi.fn(() => orderQuery),
    eq: vi.fn((column: string) => {
      if (column === 'status') return Promise.resolve({ data: orderRows, error: null })
      return orderQuery
    }),
    order: vi.fn(() => orderQuery),
    limit: vi.fn(() => orderQuery),
  }
  const itemsQuery = {
    select: vi.fn(() => itemsQuery),
    eq: vi.fn(() => itemsQuery),
    in: vi.fn(async () => ({
      data: [
        {
          order_id: 'order-1',
          name_ko: '테스트 장비',
          unique_name: 'T4_TEST_ITEM',
          enchant: 0,
          quality: 1,
          quantity: 1,
          unit_points: 100,
          subtotal_points: 100,
          pricing_source: 'catalog',
          catalog_unit_silver_snapshot: 100,
          member_quote_unit_silver: 70,
          member_quote_unit_points: 70,
          member_quote_city: 'Martlock',
          member_quote_note: 'market looked cheaper',
          member_quote_evidence_url: 'https://example.com/price',
        },
      ],
      error: null,
    })),
  }
  const inventoryQuery = {
    select: vi.fn(() => inventoryQuery),
    eq: vi.fn(() => inventoryQuery),
    in: vi.fn(async () => ({
      data: [
        {
          id: 'inventory-1',
          unique_name: 'T4_TEST_ITEM',
          enchant: 0,
          quality: 5,
          stock: 3,
        },
      ],
      error: null,
    })),
  }
  const from = vi.fn((table: string) => {
    if (table === 'shop_orders') return orderQuery
    if (table === 'shop_order_items') return itemsQuery
    if (table === 'shop_inventory') return inventoryQuery
    throw new Error(`Unexpected table: ${table}`)
  })
  return { db: { from }, orderQuery, itemsQuery, inventoryQuery }
}

describe('listShopOrders', () => {
  beforeEach(() => {
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.getPointBalancesByMember.mockReset()

    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getPointBalancesByMember.mockResolvedValue({
      balances: new Map([['member-1', 500]]),
      error: null,
    })
  })

  it('maps member quote fields and suggested quote total for admin review', async () => {
    const { db, orderQuery, itemsQuery, inventoryQuery } = createListOrdersDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(listShopOrders('pending')).resolves.toEqual({
      orders: [
        {
          id: 'order-1',
          discordId: 'member-1',
          username: 'MemberOne',
          totalPoints: 100,
          suggestedTotalPoints: 70,
          priceReviewRequired: true,
          stockReservedAt: '2026-06-03T00:00:00.000Z',
          balance: 500,
          status: 'pending',
          memberNote: null,
          adminNote: null,
          pickupNote: 'Guild chest tab 2',
          createdAt: '2026-06-03T00:00:00.000Z',
          resolvedAt: null,
          resolvedBy: null,
          items: [
            {
              inventoryId: 'inventory-1',
              nameKo: '테스트 장비',
              uniqueName: 'T4_TEST_ITEM',
              enchant: 0,
              quality: 1,
              quantity: 1,
              unitPoints: 100,
              subtotalPoints: 100,
              stockAvailable: 3,
              pricingSource: 'catalog',
              catalogUnitSilverSnapshot: 100,
              memberQuoteUnitSilver: 70,
              memberQuoteUnitPoints: 70,
              memberQuoteCity: 'Martlock',
              memberQuoteNote: 'market looked cheaper',
              memberQuoteEvidenceUrl: 'https://example.com/price',
            },
          ],
        },
      ],
    })

    expect(orderQuery.eq).toHaveBeenCalledWith('guild_id', 'guild-1')
    expect(orderQuery.eq).toHaveBeenCalledWith('status', 'pending')
    expect(itemsQuery.eq).toHaveBeenCalledWith('guild_id', 'guild-1')
    expect(inventoryQuery.eq).toHaveBeenCalledWith('guild_id', 'guild-1')
  })
})

function createApproveOrderDb() {
  const orderQuery = {
    select: vi.fn(() => orderQuery),
    eq: vi.fn(() => orderQuery),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { total_points: 100 },
      error: null,
    }),
  }
  const from = vi.fn((table: string) => {
    if (table === 'shop_orders') return orderQuery
    throw new Error(`Unexpected table: ${table}`)
  })
  const rpc = vi.fn().mockResolvedValue({ error: null })
  return { db: { from, rpc }, from, rpc, orderQuery }
}

describe('approveShopOrder', () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset()
    mocks.getTranslations.mockReset()
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.logAdminAction.mockReset()

    mocks.getTranslations.mockResolvedValue(
      (key: string, values?: Record<string, unknown>) =>
        values?.max ? `${key}:${values.max}` : key,
    )
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
  })

  it('passes pickup note to the approval RPC and audit log', async () => {
    const { db, rpc } = createApproveOrderDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(
      approveShopOrder('order-1', ' internal memo ', 70, ' Guild chest tab 2 '),
    ).resolves.toEqual({})

    expect(rpc).toHaveBeenCalledWith('approve_shop_order', {
      p_id: 'order-1',
      p_admin_id: 'admin-1',
      p_guild_id: 'guild-1',
      p_admin_note: 'internal memo',
      p_total_points_override: 70,
      p_pickup_note: 'Guild chest tab 2',
    })
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'shop.order.approve',
        details: expect.objectContaining({
          adminNote: 'internal memo',
          pickupNote: 'Guild chest tab 2',
          requestedTotalPoints: 100,
          approvedTotalPoints: 70,
        }),
      }),
    )
  })

  it('rejects pickup notes that are too long before calling the RPC', async () => {
    const { db, rpc } = createApproveOrderDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(
      approveShopOrder('order-1', undefined, null, 'x'.repeat(301)),
    ).resolves.toEqual({ error: 'pickupNoteTooLong:300' })

    expect(rpc).not.toHaveBeenCalled()
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
    mocks.getPointBalancesByMember.mockReset()

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
        applied_quantity: 2,
        ignored_quantity: 0,
        ignored_reason: null,
        matched_order_id: null,
        matched_order_item_id: null,
        matched_order_items: [],
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

  it('stores shop-order fulfillment withdrawals without applying another stock delta', async () => {
    const { db, rpc, insertCalls } = createImportDb({
      approvedOrders: [
        {
          id: 'order-1',
          created_at: '2026-05-01T00:00:00.000Z',
          stock_reserved_at: '2026-05-01T00:00:00.000Z',
          resolved_at: '2026-05-01T01:00:00.000Z',
        },
      ],
      orderItems: [
        {
          id: 'order-item-1',
          order_id: 'order-1',
          unique_name: 'T4_TEST_ITEM',
          enchant: 0,
          quality: 1,
          quantity: 1,
        },
      ],
      fulfilledLogs: [],
    })
    const loggedAt = new Date('2026-05-01T02:00:00.000Z')
    mocks.requireAnyCapability.mockResolvedValue(db)
    mocks.parseChestLog.mockReturnValue({
      entries: [
        {
          loggedAt,
          player: 'Quartermaster',
          itemName: '테스트 장비',
          enchant: 0,
          quality: 1,
          quantity: -1,
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
      stockChanges: [],
    })
    expect(insertCalls).toEqual([[
      {
        guild_id: 'guild-1',
        logged_at: '2026-05-01T02:00:00.000Z',
        import_sequence: 0,
        player: 'Quartermaster',
        item_name_raw: '테스트 장비',
        enchant: 0,
        quality: 1,
        quantity: -1,
        applied_quantity: 0,
        ignored_quantity: -1,
        ignored_reason: 'shop_order_fulfillment',
        matched_order_id: 'order-1',
        matched_order_item_id: 'order-item-1',
        matched_order_items: [
          {
            orderId: 'order-1',
            orderItemId: 'order-item-1',
            quantity: 1,
          },
        ],
        unique_name: 'T4_TEST_ITEM',
        imported_by: 'admin-1',
      },
    ]])
    expect(rpc).not.toHaveBeenCalledWith('apply_shop_stock_deltas', expect.anything())
    expect(rpc).not.toHaveBeenCalledWith('apply_shop_stock_delta', expect.anything())
  })

  it('matches reserved order fulfillment even when delivery log quality differs and approval happens later', async () => {
    const { db, rpc, insertCalls } = createImportDb({
      approvedOrders: [
        {
          id: 'order-1',
          created_at: '2026-05-01T00:00:00.000Z',
          stock_reserved_at: '2026-05-01T00:10:00.000Z',
          resolved_at: '2026-05-01T02:00:00.000Z',
        },
      ],
      orderItems: [
        {
          id: 'order-item-1',
          order_id: 'order-1',
          unique_name: 'T4_TEST_ITEM',
          enchant: 0,
          quality: 1,
          quantity: 1,
        },
      ],
      fulfilledLogs: [],
    })
    const loggedAt = new Date('2026-05-01T01:00:00.000Z')
    mocks.requireAnyCapability.mockResolvedValue(db)
    mocks.parseChestLog.mockReturnValue({
      entries: [
        {
          loggedAt,
          player: 'Quartermaster',
          itemName: '테스트 장비',
          enchant: 0,
          quality: 5,
          quantity: -1,
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
    expect(result.stockChanges).toEqual([])
    expect(insertCalls[0]?.[0]).toMatchObject({
      quality: 5,
      applied_quantity: 0,
      ignored_quantity: -1,
      ignored_reason: 'shop_order_fulfillment',
      matched_order_item_id: 'order-item-1',
    })
    expect(rpc).not.toHaveBeenCalledWith('apply_shop_stock_deltas', expect.anything())
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
