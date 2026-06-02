import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetShopInventory } from './shop-inventory'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getTranslations: vi.fn(),
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  syncTenantShopPrices: vi.fn(),
  logAdminAction: vi.fn(),
  getLogOperatingStart: vi.fn(),
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

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/shop/price-sync', () => ({
  syncTenantShopPrices: mocks.syncTenantShopPrices,
}))

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminAction,
}))

vi.mock('@/lib/log-operating-start-server', () => ({
  getLogOperatingStart: mocks.getLogOperatingStart,
}))

function createResetDb(options: {
  rpcResult?: {
    data: unknown
    error: { message: string } | null
  }
} = {}) {
  const rpcResult = options.rpcResult ?? {
    data: {
      inventory_rows_deleted: 4,
      logs_deleted: 7,
      orders_cancelled: 2,
    },
    error: null,
  }
  const rpc = vi.fn().mockResolvedValue(rpcResult)
  return {
    db: { rpc },
    rpc,
  }
}

describe('resetShopInventory', () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset()
    mocks.getTranslations.mockReset()
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.syncTenantShopPrices.mockReset()
    mocks.logAdminAction.mockReset()
    mocks.getLogOperatingStart.mockReset()

    mocks.getTranslations.mockResolvedValue((key: string, params?: { reason?: string }) =>
      params?.reason ? `${key}: ${params.reason}` : key,
    )
  })

  it('requires an authenticated inventory admin', async () => {
    mocks.getSession.mockResolvedValue(null)

    await expect(resetShopInventory()).resolves.toEqual({
      inventoryRowsDeleted: 0,
      logsDeleted: 0,
      ordersCancelled: 0,
      error: 'Unauthorized',
    })
    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })

  it('resets all current guild shop data and cancels pending orders transactionally', async () => {
    const { db, rpc } = createResetDb()
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(resetShopInventory()).resolves.toEqual({
      inventoryRowsDeleted: 4,
      logsDeleted: 7,
      ordersCancelled: 2,
    })

    expect(rpc).toHaveBeenCalledWith('reset_shop_inventory_all', {
      p_guild_id: 'guild-1',
      p_admin_id: 'admin-1',
      p_cancel_note: 'resetAutoCancelNote',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/shop')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/shop')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/approvals')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/me')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(mocks.logAdminAction).toHaveBeenCalledWith({
      guildId: 'guild-1',
      adminDiscordId: 'admin-1',
      action: 'shop.item.remove',
      targetKind: 'shop_item',
      details: {
        kind: 'inventory.reset_all',
        inventoryRowsDeleted: 4,
        logsDeleted: 7,
        ordersCancelled: 2,
      },
    })
  })

  it('returns the reset rpc error without audit or revalidation', async () => {
    const { db } = createResetDb({
      rpcResult: {
        data: null,
        error: { message: 'reset failed' },
      },
    })
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(resetShopInventory()).resolves.toEqual({
      inventoryRowsDeleted: 0,
      logsDeleted: 0,
      ordersCancelled: 0,
      error: 'reset failed',
    })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })
})
