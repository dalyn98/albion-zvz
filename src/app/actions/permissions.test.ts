import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
  getSession: vi.fn(),
  sessionHas: vi.fn(),
  getSessionGuildId: vi.fn(),
  getAdminClient: vi.fn(),
  logAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
  sessionHas: mocks.sessionHas,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminAction,
}))

import { upsertRoleGrant, upsertUserOverride } from './permissions'

describe('permission mutation input validation', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.getTranslations.mockResolvedValue((key: string) => key)
    mocks.getSession.mockResolvedValue({ discordId: '123456789012345678' })
    mocks.sessionHas.mockReturnValue(true)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
  })

  it('rejects oversized role capability strings before writing', async () => {
    const from = vi.fn()
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(
      upsertRoleGrant({
        discordRoleId: '123456789012345678',
        capabilities: '9'.repeat(20),
      }),
    ).resolves.toEqual({ error: 'invalidInput' })

    expect(from).not.toHaveBeenCalled()
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })

  it('rejects oversized user override capability strings before writing', async () => {
    const from = vi.fn()
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(
      upsertUserOverride({
        discordId: '123456789012345678',
        capabilitiesGranted: '1',
        capabilitiesRevoked: '9'.repeat(20),
      }),
    ).resolves.toEqual({ error: 'invalidInput' })

    expect(from).not.toHaveBeenCalled()
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
  })
})
