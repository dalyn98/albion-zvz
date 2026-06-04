import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getTranslations: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  getAdminClient: vi.fn(),
  getAppSetting: vi.fn(),
  getMemberPointBalance: vi.fn(),
  isLocalGuildAccountRestrictedFromResources: vi.fn(),
  sendAdminNotification: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
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
  getMemberPointBalance: mocks.getMemberPointBalance,
}))

vi.mock('@/lib/local-guild-account', () => ({
  isLocalGuildAccountRestrictedFromResources:
    mocks.isLocalGuildAccountRestrictedFromResources,
}))

vi.mock('@/lib/admin-notifications', () => ({
  sendAdminNotification: mocks.sendAdminNotification,
}))

import { cancelMyOrder, submitShopOrder } from './shop-member'

function createShopOrderDb(options: {
  stock?: number
  manualPrice?: number | null
  autoPriceSilver?: number | null
} = {}) {
  const stock = options.stock ?? 1
  const manualPrice = options.manualPrice === undefined ? 100 : options.manualPrice
  const autoPriceSilver = options.autoPriceSilver === undefined ? null : options.autoPriceSilver
  const inventoryQuery = {
    select: vi.fn(() => inventoryQuery),
    eq: vi.fn(() => inventoryQuery),
    in: vi.fn(async () => ({
      data: [
        {
          id: 'inventory-1',
          unique_name: 'T4_TEST_ITEM',
          enchant: 0,
          quality: 1,
          stock,
          name_ko: '테스트 장비',
          manual_price: manualPrice,
          auto_price_silver: autoPriceSilver,
        },
      ],
      error: null,
    })),
  }
  const from = vi.fn((table: string) => {
    if (table === 'shop_inventory') return inventoryQuery
    throw new Error(`unexpected table: ${table}`)
  })
  const rpc = vi.fn(async () => ({ data: 'order-1', error: null }))
  return { db: { from, rpc }, inventoryQuery, rpc }
}

function createCancelOrderDb(error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ error }))
  return { db: { rpc }, rpc }
}

describe('submitShopOrder', () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset()
    mocks.getTranslations.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.getAdminClient.mockReset()
    mocks.getAppSetting.mockReset()
    mocks.getMemberPointBalance.mockReset()
    mocks.isLocalGuildAccountRestrictedFromResources.mockReset()
    mocks.sendAdminNotification.mockReset()

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
    mocks.getMemberPointBalance.mockResolvedValue({ balance: 1000, error: null })
    mocks.isLocalGuildAccountRestrictedFromResources.mockReturnValue(false)
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

    expect(rpc).toHaveBeenCalledWith('submit_shop_order', {
      p_guild_id: 'guild-1',
      p_discord_id: 'member-1',
      p_username: 'MemberOne',
      p_price_review_required: false,
      p_total_points: 200,
      p_member_note: 'deliver soon',
      p_lines: [
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
    })
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
            memberQuoteEvidenceUrl: 'https://example.com/price',
          },
        ],
        '',
      ),
    ).resolves.toEqual({ ok: true, orderId: 'order-1' })

    expect(rpc).toHaveBeenCalledWith('submit_shop_order', {
      p_guild_id: 'guild-1',
      p_discord_id: 'member-1',
      p_username: 'MemberOne',
      p_price_review_required: true,
      p_total_points: 300,
      p_member_note: null,
      p_lines: [
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
          member_quote_evidence_url: 'https://example.com/price',
        },
      ],
    })
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

    expect(rpc).toHaveBeenCalledWith('submit_shop_order', {
      p_guild_id: 'guild-1',
      p_discord_id: 'member-1',
      p_username: 'MemberOne',
      p_price_review_required: true,
      p_total_points: 70,
      p_member_note: null,
      p_lines: [
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
    })
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

    mocks.getTranslations.mockResolvedValue((key: string) => key)
    mocks.getSession.mockResolvedValue({
      discordId: 'member-1',
      username: 'MemberOne',
      isMember: true,
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.isLocalGuildAccountRestrictedFromResources.mockReturnValue(false)
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
})
