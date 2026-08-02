import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  getTranslations: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  getAdminClient: vi.fn(),
  getAppSetting: vi.fn(),
  getMemberSpendablePointBalance: vi.fn(),
  isLocalGuildAccountRestrictedFromResources: vi.fn(),
  sendAdminNotification: vi.fn(),
  loadApplicationCommandReceipt: vi.fn(),
  executeApplicationCommand: vi.fn(),
  resolveStableMemberOwnership: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
  updateTag: mocks.updateTag,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/auth', () => ({
  requireCurrentMutationSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/app-settings', () => ({
  getAppSetting: mocks.getAppSetting,
}))

vi.mock('@/lib/point-ledger', () => ({
  getMemberSpendablePointBalance: mocks.getMemberSpendablePointBalance,
}))

vi.mock('@/lib/local-guild-account', () => ({
  isLocalGuildAccountRestrictedFromResources:
    mocks.isLocalGuildAccountRestrictedFromResources,
}))

vi.mock('@/lib/admin-notifications', () => ({
  sendAdminNotification: mocks.sendAdminNotification,
}))

vi.mock('@/lib/application-command', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/application-command')>()),
  loadApplicationCommandReceipt: mocks.loadApplicationCommandReceipt,
  executeApplicationCommand: mocks.executeApplicationCommand,
}))

vi.mock('@/lib/stable-member-ownership', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stable-member-ownership')>()),
  resolveStableMemberOwnership: mocks.resolveStableMemberOwnership,
}))

import { cancelMyOrder, reviewShopOrder, submitShopOrder } from './shop-member'

function createShopOrderDb(options: {
  stock?: number
  quality?: number
  manualPrice?: number | null
  autoPriceSilver?: number | null
  inventoryRows?: Array<{
    id: string
    manualPrice: number | null
  }>
} = {}) {
  const stock = options.stock ?? 1
  const quality = options.quality ?? 1
  const manualPrice = options.manualPrice === undefined ? 100 : options.manualPrice
  const autoPriceSilver = options.autoPriceSilver === undefined ? null : options.autoPriceSilver
  const inventoryQuery = {
    select: vi.fn(() => inventoryQuery),
    eq: vi.fn(() => inventoryQuery),
    in: vi.fn(async () => ({
      data: (options.inventoryRows ?? [{ id: 'inventory-1', manualPrice }]).map((row) => ({
        id: row.id,
        unique_name: row.id === 'inventory-1' ? 'T4_TEST_ITEM' : `T4_TEST_ITEM_${row.id}`,
        enchant: 0,
        quality,
        stock,
        name_ko: row.id === 'inventory-1' ? '테스트 장비' : `테스트 장비 ${row.id}`,
        manual_price: row.manualPrice,
        auto_price_silver: autoPriceSilver,
      })),
      error: null,
    })),
  }
  const from = vi.fn((table: string) => {
    if (table === 'shop_inventory') return inventoryQuery
    throw new Error(`unexpected table: ${table}`)
  })
  return {
    db: { from },
    inventoryQuery,
    rpc: mocks.executeApplicationCommand,
  }
}

function createCancelOrderDb(
  error: { message: string } | null = null,
  options: {
    rowDiscordId?: string
    rowGuildMemberId?: string | null
  } = {},
) {
  const rpc = vi.fn(async () => ({ error }))
  const orderQuery = {
    select: vi.fn(() => orderQuery),
    eq: vi.fn(() => orderQuery),
    maybeSingle: vi.fn(async () => ({
      data: {
        discord_id: options.rowDiscordId ?? 'member-1',
        guild_member_id: options.rowGuildMemberId ?? 'member-record-1',
      },
      error: null,
    })),
  }
  const from = vi.fn((table: string) => {
    if (table === 'shop_orders') return orderQuery
    throw new Error(`unexpected table: ${table}`)
  })
  return { db: { from, rpc }, rpc }
}

describe('submitShopOrder', () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset()
    mocks.getTranslations.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.getAdminClient.mockReset()
    mocks.getAppSetting.mockReset()
    mocks.getMemberSpendablePointBalance.mockReset()
    mocks.isLocalGuildAccountRestrictedFromResources.mockReset()
    mocks.sendAdminNotification.mockReset()
    mocks.loadApplicationCommandReceipt.mockReset()
    mocks.executeApplicationCommand.mockReset()
    mocks.resolveStableMemberOwnership.mockReset()

    mocks.getTranslations.mockResolvedValue(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${JSON.stringify(values)}` : key,
    )
    mocks.getSession.mockResolvedValue({
      discordId: 'member-1',
      username: 'MemberOne',
      isMember: true,
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAppSetting.mockResolvedValue('1')
    mocks.getMemberSpendablePointBalance.mockResolvedValue({
      balance: 1000,
      escrowed: 0,
      spendable: 1000,
      error: null,
    })
    mocks.isLocalGuildAccountRestrictedFromResources.mockReturnValue(false)
    mocks.loadApplicationCommandReceipt.mockResolvedValue(null)
    mocks.executeApplicationCommand.mockResolvedValue({
      orderId: 'order-1',
      status: 'pending',
      replayed: false,
    })
    mocks.resolveStableMemberOwnership.mockResolvedValue({
      guildMemberId: 'member-record-1',
    })
  })

  it('rejects duplicate cart lines when their combined quantity exceeds stock', async () => {
    const { db, rpc } = createShopOrderDb()
    mocks.getAdminClient.mockReturnValue(db)

    await expect(
      submitShopOrder(
        [
          { inventoryId: 'inventory-1', quantity: 1 },
          { inventoryId: 'inventory-1', quantity: 1 },
        ],
        '',
      ),
    ).resolves.toEqual({
      ok: false,
      error: 'itemStockShort:{"name":"테스트 장비","stock":1}',
    })

    expect(rpc).not.toHaveBeenCalled()
  })

  it('reviews the current server price before opening order confirmation', async () => {
    const { db } = createShopOrderDb({ manualPrice: 125 })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(
      reviewShopOrder([{ inventoryId: 'inventory-1', quantity: 1 }]),
    ).resolves.toEqual({
      ok: true,
      balance: 1000,
      lines: [{
        inventoryId: 'inventory-1',
        quantity: 1,
        unitPoints: 125,
        subtotalPoints: 125,
        pricingSource: 'catalog',
      }],
    })
  })

  it('rejects submission when the price changed after review', async () => {
    const { db, rpc } = createShopOrderDb({ manualPrice: 125 })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(
      submitShopOrder(
        [{ inventoryId: 'inventory-1', quantity: 1, expectedUnitPoints: 100 }],
        '',
      ),
    ).resolves.toEqual({ ok: false, error: 'shopPriceChanged' })
    expect(rpc).not.toHaveBeenCalled()
  })

  it('accepts a zero-point reviewed line when a mixed order still has a positive total', async () => {
    const { db, rpc } = createShopOrderDb({
      inventoryRows: [
        { id: 'inventory-free', manualPrice: 0 },
        { id: 'inventory-paid', manualPrice: 100 },
      ],
    })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(
      submitShopOrder(
        [
          { inventoryId: 'inventory-free', quantity: 1, expectedUnitPoints: 0 },
          { inventoryId: 'inventory-paid', quantity: 1, expectedUnitPoints: 100 },
        ],
        '',
      ),
    ).resolves.toEqual({ ok: true, orderId: 'order-1' })

    expect(rpc).toHaveBeenCalledWith(
      expect.objectContaining({
        commandName: 'shop.order',
        executionPayload: expect.objectContaining({
          totalPoints: 100,
          lines: expect.arrayContaining([
          expect.objectContaining({ unique_name: 'T4_TEST_ITEM_inventory-free', unit_points: 0 }),
          expect.objectContaining({ unique_name: 'T4_TEST_ITEM_inventory-paid', unit_points: 100 }),
          ]),
        }),
      }),
    )
  })

  it('sends each inventory item once to the order RPC after merging duplicate cart lines', async () => {
    const { db, rpc } = createShopOrderDb({ stock: 2 })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(
      submitShopOrder(
        [
          { inventoryId: 'inventory-1', quantity: 1 },
          { inventoryId: 'inventory-1', quantity: 1 },
        ],
        'deliver soon',
      ),
    ).resolves.toEqual({ ok: true, orderId: 'order-1' })

    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({
      commandName: 'shop.order',
      executionPayload: {
        spendableBefore: 1000,
        priceReviewRequired: false,
        totalPoints: 200,
        memberNote: 'deliver soon',
        lines: [
        {
          unique_name: 'T4_TEST_ITEM',
          enchant: 0,
          quality: 1,
          name_ko: '테스트 장비',
          quantity: 2,
          unit_points: 100,
          subtotal_points: 200,
          pricing_source: 'catalog',
          catalog_unit_silver_snapshot: 100,
          member_quote_unit_silver: null,
          member_quote_unit_points: null,
          member_quote_city: null,
          member_quote_note: null,
          member_quote_evidence_url: null,
        },
        ],
      },
    }))
    expect(mocks.sendAdminNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'shop',
        sourceTable: 'shop_orders',
        sourceId: 'order-1',
        title: 'shopTitle',
        body: 'shopBody:{"user":"MemberOne","points":"200"}',
        url: '/admin/dashboard/approvals?tab=shop&order=order-1#shop-order-order-1',
        fields: [
          {
            name: 'shopItemsField',
            value: 'shopItemLine:{"item":"테스트 장비","quantity":"2","points":"200"}',
          },
          {
            name: 'shopSummaryField',
            value: 'shopSummaryValue:{"points":"200","types":1,"quantity":"2"}',
            inline: true,
          },
        ],
      }),
    )
  })

  it('submits three-digit consumable quantities as a single order line', async () => {
    const { db, rpc } = createShopOrderDb({ stock: 150, manualPrice: 2 })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(
      submitShopOrder([{ inventoryId: 'inventory-1', quantity: 125 }], ''),
    ).resolves.toEqual({ ok: true, orderId: 'order-1' })

    expect(rpc).toHaveBeenCalledWith(
      expect.objectContaining({
        executionPayload: expect.objectContaining({
          totalPoints: 250,
          lines: [
          expect.objectContaining({
            quantity: 125,
            unit_points: 2,
            subtotal_points: 250,
          }),
          ],
        }),
      }),
    )
  })

  it('allows an unpriced inventory item when the member provides a quote', async () => {
    const { db, rpc } = createShopOrderDb({
      stock: 2,
      manualPrice: null,
      autoPriceSilver: null,
    })
    mocks.getAdminClient.mockReturnValue(db)
    mocks.getAppSetting.mockResolvedValue('0.5')

    await expect(
      submitShopOrder(
        [
          {
            inventoryId: 'inventory-1',
            quantity: 2,
            memberQuoteUnitSilver: 300,
            memberQuoteCity: 'Martlock',
            memberQuoteNote: 'recent buy order',
          },
        ],
        '',
      ),
    ).resolves.toEqual({ ok: true, orderId: 'order-1' })

    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({
      executionPayload: {
        spendableBefore: 1000,
        priceReviewRequired: true,
        totalPoints: 300,
        memberNote: '',
        lines: [
        {
          unique_name: 'T4_TEST_ITEM',
          enchant: 0,
          quality: 1,
          name_ko: '테스트 장비',
          quantity: 2,
          unit_points: 150,
          subtotal_points: 300,
          pricing_source: 'member_quote',
          catalog_unit_silver_snapshot: null,
          member_quote_unit_silver: 300,
          member_quote_unit_points: 150,
          member_quote_city: 'Martlock',
          member_quote_note: 'recent buy order',
          member_quote_evidence_url: null,
        },
        ],
      },
    }))
    expect(mocks.sendAdminNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: expect.arrayContaining([
          {
            name: 'shopItemsField',
            value: 'shopItemLine:{"item":"테스트 장비","quantity":"2","points":"300"}',
          },
          {
            name: 'shopPriceReviewField',
            value: 'shopPriceReviewValue',
            inline: true,
          },
        ]),
      }),
    )
  })

  it('uses a member quote as the requested total even when the item already has a catalog price', async () => {
    const { db, rpc } = createShopOrderDb({ stock: 1, manualPrice: 100 })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(
      submitShopOrder(
        [
          {
            inventoryId: 'inventory-1',
            quantity: 1,
            memberQuoteUnitSilver: 70,
            memberQuoteNote: 'market looked cheaper',
          },
        ],
        '',
      ),
    ).resolves.toEqual({ ok: true, orderId: 'order-1' })

    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({
      executionPayload: {
        spendableBefore: 1000,
        priceReviewRequired: true,
        totalPoints: 70,
        memberNote: '',
        lines: [
        {
          unique_name: 'T4_TEST_ITEM',
          enchant: 0,
          quality: 1,
          name_ko: '테스트 장비',
          quantity: 1,
          unit_points: 70,
          subtotal_points: 70,
          pricing_source: 'member_quote',
          catalog_unit_silver_snapshot: 100,
          member_quote_unit_silver: 70,
          member_quote_unit_points: 70,
          member_quote_city: null,
          member_quote_note: 'market looked cheaper',
          member_quote_evidence_url: null,
        },
        ],
      },
    }))
  })

  it('submits shop order lines with canonical quality regardless of the inventory row quality', async () => {
    const { db, rpc } = createShopOrderDb({ quality: 5, stock: 1, manualPrice: 100 })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(
      submitShopOrder([{ inventoryId: 'inventory-1', quantity: 1 }], ''),
    ).resolves.toEqual({ ok: true, orderId: 'order-1' })

    expect(rpc).toHaveBeenCalledWith(
      expect.objectContaining({
        executionPayload: expect.objectContaining({
          lines: [
          expect.objectContaining({
            unique_name: 'T4_TEST_ITEM',
            enchant: 0,
            quality: 1,
          }),
          ],
        }),
      }),
    )
  })

  it('does not emit a second admin notification when an idempotent retry replays the order', async () => {
    const { db } = createShopOrderDb({ stock: 1, manualPrice: 100 })
    mocks.getAdminClient.mockReturnValue(db)
    mocks.executeApplicationCommand.mockResolvedValueOnce({
      orderId: 'order-1',
      status: 'pending',
      replayed: true,
    })

    await expect(
      submitShopOrder(
        [{ inventoryId: 'inventory-1', quantity: 1 }],
        '',
        '11111111-1111-4111-8111-111111111111',
      ),
    ).resolves.toEqual({ ok: true, orderId: 'order-1' })

    expect(mocks.sendAdminNotification).not.toHaveBeenCalled()
  })
})

describe('cancelMyOrder', () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset()
    mocks.getTranslations.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.getAdminClient.mockReset()
    mocks.isLocalGuildAccountRestrictedFromResources.mockReset()
    mocks.resolveStableMemberOwnership.mockReset()

    mocks.getTranslations.mockResolvedValue((key: string) => key)
    mocks.getSession.mockResolvedValue({
      discordId: 'member-1',
      username: 'MemberOne',
      isMember: true,
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.isLocalGuildAccountRestrictedFromResources.mockReturnValue(false)
    mocks.resolveStableMemberOwnership.mockResolvedValue({
      guildMemberId: 'member-record-1',
    })
  })

  it('cancels pending orders through the stock-restoring RPC', async () => {
    const { db, rpc } = createCancelOrderDb()
    mocks.getAdminClient.mockReturnValue(db)

    await expect(cancelMyOrder('order-1')).resolves.toEqual({})

    expect(rpc).toHaveBeenCalledWith('cancel_shop_order', {
      p_id: 'order-1',
      p_guild_id: 'guild-1',
      p_discord_id: 'member-1',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/shop')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/me')
  })

  it('does not report success when the stock-restoring RPC cannot cancel a pending order', async () => {
    const { db, rpc } = createCancelOrderDb({ message: 'ORDER_NOT_PENDING' })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(cancelMyOrder('order-1')).resolves.toEqual({
      error: 'alreadyProcessedCannotCancel',
    })

    expect(rpc).toHaveBeenCalledWith('cancel_shop_order', {
      p_id: 'order-1',
      p_guild_id: 'guild-1',
      p_discord_id: 'member-1',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('uses the historical access subject after a local account is linked to Discord', async () => {
    const { db, rpc } = createCancelOrderDb(null, {
      rowDiscordId: 'local:account-1',
      rowGuildMemberId: 'member-record-1',
    })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(cancelMyOrder('order-1')).resolves.toEqual({})

    expect(rpc).toHaveBeenCalledWith('cancel_shop_order', {
      p_id: 'order-1',
      p_guild_id: 'guild-1',
      p_discord_id: 'local:account-1',
    })
  })
})
