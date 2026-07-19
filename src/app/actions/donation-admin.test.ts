import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  revalidatePath: vi.fn(),
  logAdminAction: vi.fn(),
  sendLocalizedDiscordDmToUser: vi.fn(),
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

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminAction,
}))

vi.mock('@/lib/discord-dm-localized', () => ({
  sendLocalizedDiscordDmToUser: mocks.sendLocalizedDiscordDmToUser,
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

import { CAP } from '@/lib/permissions'
import { approveDonationRequest, getDonationScreenshotUrl } from './donation-admin'

describe('donation admin actions', () => {
  beforeEach(() => {
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.logAdminAction.mockReset()
    mocks.sendLocalizedDiscordDmToUser.mockReset()
    mocks.syncDiscordAdminApprovalNotification.mockReset()
  })

  it('gates donation screenshot review with the donation approval capability', async () => {
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: 'https://example.test/signed' },
      error: null,
    }))
    const from = vi.fn(() => ({ createSignedUrl }))
    mocks.requireAnyCapability.mockResolvedValue({ storage: { from } })

    await expect(getDonationScreenshotUrl('guild/path.png')).resolves.toEqual({
      url: 'https://example.test/signed',
    })

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.DONATION_APPROVE])
    expect(from).toHaveBeenCalledWith('donation-screenshots')
  })

  it('syncs a successful site approval to the original Discord notification', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { discord_id: 'member-1', silver: 1_000 },
        error: null,
      }),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    const rpc = vi.fn().mockResolvedValue({ error: null })
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1', username: 'Admin' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireAnyCapability.mockResolvedValue({
      rpc,
      from: vi.fn(() => query),
    })

    await expect(approveDonationRequest('donation-1')).resolves.toEqual({})

    expect(mocks.syncDiscordAdminApprovalNotification).toHaveBeenCalledWith({
      actor: { guildId: 'guild-1', discordId: 'admin-1', username: 'Admin' },
      kind: 'donation',
      sourceId: 'donation-1',
      resolution: 'approved',
    })
  })
})
