import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetShopChestLogs } from './shop-admin'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getTranslations: vi.fn(),
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  logAdminAction: vi.fn(),
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

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminAction,
}))

vi.mock('./shop-inventory', () => ({
  syncShopPrices: vi.fn(),
}))

function createDeleteQuery(result: { count: number | null; error: { message: string } | null }) {
  const eq = vi.fn().mockResolvedValue(result)
  const deleteFn = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ delete: deleteFn }))
  return { db: { from }, from, deleteFn, eq }
}

describe('resetShopChestLogs', () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset()
    mocks.getTranslations.mockReset()
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.logAdminAction.mockReset()
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
