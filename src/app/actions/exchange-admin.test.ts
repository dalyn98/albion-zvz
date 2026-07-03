import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  revalidatePath: vi.fn(),
  logAdminAction: vi.fn(),
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

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

import { deleteRoleReward, listRoleRewards, updateRoleReward } from './exchange-admin'

describe('updateRoleReward', () => {
  beforeEach(() => {
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.logAdminAction.mockReset()
  })

  it('rejects rewards outside postgres integer range before admin queries run', async () => {
    await expect(updateRoleReward('EngageDps', 2147483648)).resolves.toEqual({
      error: 'nonNegativeInteger',
    })

    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })

  it('lists stored role rewards including custom role groups', async () => {
    const order = vi.fn(async () => ({
      data: [
        { role_name: 'EngageDps', silver: 2000, payout_rate_percent: 80, updated_at: 'engage' },
        { role_name: 'Flex Support', silver: 3000, payout_rate_percent: null, updated_at: 'custom' },
      ],
      error: null,
    }))
    const eq = vi.fn(() => ({ order }))
    const select = vi.fn(() => ({ eq }))
    const from = vi.fn((table: string) => {
      expect(table).toBe('role_rewards')
      return { select }
    })

    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireAnyCapability.mockResolvedValue({ from })

    const result = await listRoleRewards()

    expect(result.error).toBeUndefined()
    expect(select).toHaveBeenCalledWith('role_name, silver, payout_rate_percent, updated_at')
    expect(result.rewards).toEqual([
      { role_name: 'EngageDps', silver: 2000, payout_rate_percent: 80, updated_at: 'engage' },
      { role_name: 'Flex Support', silver: 3000, payout_rate_percent: null, updated_at: 'custom' },
    ])
  })

  it('upserts custom role reward policies with an optional payout rate override', async () => {
    const upsert = vi.fn(async () => ({ error: null }))
    const from = vi.fn((table: string) => {
      expect(table).toBe('role_rewards')
      return { upsert }
    })

    mocks.getSession.mockResolvedValue({ discordId: 'admin-1', username: 'Admin' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireAnyCapability.mockResolvedValue({ from })

    await expect(updateRoleReward('Flex Support', 1_250_000, 85)).resolves.toEqual({})

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        guild_id: 'guild-1',
        role_name: 'Flex Support',
        silver: 1_250_000,
        payout_rate_percent: 85,
      }),
      { onConflict: 'guild_id,role_name' },
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/settings')
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'role_reward.update',
        details: expect.objectContaining({
          roleName: 'Flex Support',
          silver: 1_250_000,
          payoutRatePercent: 85,
        }),
      }),
    )
  })

  it('deletes a tenant-scoped role reward policy', async () => {
    const eqRole = vi.fn(async () => ({ error: null }))
    const eqGuild = vi.fn(() => ({ eq: eqRole }))
    const deleteQuery = vi.fn(() => ({ eq: eqGuild }))
    const from = vi.fn((table: string) => {
      expect(table).toBe('role_rewards')
      return { delete: deleteQuery }
    })

    mocks.getSession.mockResolvedValue({ discordId: 'admin-1', username: 'Admin' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireAnyCapability.mockResolvedValue({ from })

    await expect(deleteRoleReward('Flex Support')).resolves.toEqual({})

    expect(eqGuild).toHaveBeenCalledWith('guild_id', 'guild-1')
    expect(eqRole).toHaveBeenCalledWith('role_name', 'Flex Support')
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'role_reward.delete',
        targetId: 'Flex Support',
      }),
    )
  })
})
