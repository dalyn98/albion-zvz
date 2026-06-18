import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  revalidatePath: vi.fn(),
  sendLocalizedDiscordDmToUser: vi.fn(),
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

vi.mock('@/lib/discord-dm-localized', () => ({
  sendLocalizedDiscordDmToUser: mocks.sendLocalizedDiscordDmToUser,
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

import { rejectRegearRequest } from './regear-admin-resolve'

describe('rejectRegearRequest', () => {
  beforeEach(() => {
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.sendLocalizedDiscordDmToUser.mockReset()
    mocks.logAdminAction.mockReset()

    mocks.getSession.mockResolvedValue({
      discordId: 'admin-1',
      username: 'Admin',
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.logAdminAction.mockResolvedValue(undefined)
  })

  it('revalidates the member regear page so rejected requests can be resubmitted', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(async () => ({
        data: {
          discord_id: 'member-1',
          event_title_snapshot: 'CTA',
        },
        error: null,
      })),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)

    const db = {
      rpc: vi.fn(async () => ({ error: null })),
      from: vi.fn(() => query),
    }
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(rejectRegearRequest('request-1', 'other', 'fix screenshot')).resolves.toEqual({})

    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/regear')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/me')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/regear')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})
