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

import { listRoleRewards, updateRoleReward } from './exchange-admin'

describe('updateRoleReward', () => {
  beforeEach(() => {
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.logAdminAction.mockReset()
  })

  it('rejects rewards outside postgres integer range before admin queries run', async () => {
    await expect(updateRoleReward('Dps', 2147483648)).resolves.toEqual({
      error: 'nonNegativeInteger',
    })

    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
  })

  it('lists only current selectable role rewards and hides legacy Dps rows', async () => {
    const order = vi.fn(async () => ({
      data: [
        { role_name: 'Dps', silver: 1000, updated_at: 'legacy' },
        { role_name: 'EngageDps', silver: 2000, updated_at: 'engage' },
        { role_name: 'BrawlerDps', silver: 3000, updated_at: 'brawler' },
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
    expect(result.rewards.map((reward) => reward.role_name)).not.toContain('Dps')
    expect(result.rewards).toEqual(
      expect.arrayContaining([
        { role_name: 'EngageDps', silver: 2000, updated_at: 'engage' },
        { role_name: 'BrawlerDps', silver: 3000, updated_at: 'brawler' },
      ]),
    )
  })
})
