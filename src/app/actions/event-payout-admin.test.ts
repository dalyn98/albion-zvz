import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  revalidatePath: vi.fn(),
  sendAdminNotification: vi.fn(),
  logAdminAction: vi.fn(),
  sendLocalizedDiscordDmsToUsers: vi.fn(),
  syncDiscordAdminApprovalNotification: vi.fn(),
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

vi.mock('@/lib/admin-notifications', () => ({
  sendAdminNotification: mocks.sendAdminNotification,
}))

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminAction,
}))

vi.mock('@/lib/discord-dm-localized', () => ({
  sendLocalizedDiscordDmsToUsers: mocks.sendLocalizedDiscordDmsToUsers,
}))

vi.mock('@/lib/discord-admin-approvals', () => ({
  syncDiscordAdminApprovalNotification: mocks.syncDiscordAdminApprovalNotification,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

import { approveEventPayoutRequest, createEventPayoutRequest } from './event-payout-admin'

describe('createEventPayoutRequest', () => {
  beforeEach(() => {
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.sendAdminNotification.mockReset()
    mocks.logAdminAction.mockReset()
    mocks.sendLocalizedDiscordDmsToUsers.mockReset()
    mocks.syncDiscordAdminApprovalNotification.mockReset()
  })

  it('rejects per-member silver outside postgres integer range before querying events', async () => {
    await expect(
      createEventPayoutRequest({
        eventId: 'event-1',
        silverPerMember: 2147483648,
      }),
    ).resolves.toEqual({ error: 'invalidAmount' })

    expect(mocks.requireAnyCapability).not.toHaveBeenCalled()
    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.getSessionGuildId).not.toHaveBeenCalled()
  })

  it('syncs a successful site approval to the original Discord notification', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          silver_per_member: 1_000,
          participants: [{ discord_id: 'member-1', username: 'Member' }],
          events: { title: 'CTA' },
        },
        error: null,
      }),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1', username: 'Admin' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireAnyCapability.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn(() => query),
    })

    await expect(approveEventPayoutRequest('payout-1')).resolves.toEqual({})

    expect(mocks.syncDiscordAdminApprovalNotification).toHaveBeenCalledWith({
      actor: { guildId: 'guild-1', discordId: 'admin-1', username: 'Admin' },
      kind: 'event_payout',
      sourceId: 'payout-1',
      resolution: 'approved',
    })
  })
})
