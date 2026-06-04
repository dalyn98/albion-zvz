import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  revalidatePath: vi.fn(),
  sendAdminNotification: vi.fn(),
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

vi.mock('@/lib/admin-notifications', () => ({
  sendAdminNotification: mocks.sendAdminNotification,
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

import { createEventPayoutRequest } from './event-payout-admin'

describe('createEventPayoutRequest', () => {
  beforeEach(() => {
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.sendAdminNotification.mockReset()
    mocks.logAdminAction.mockReset()
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
})
