import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
  requireLiveSession: vi.fn(),
  sessionHas: vi.fn(),
  getSessionGuildId: vi.fn(),
  getAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireLiveSession: mocks.requireLiveSession,
}))

vi.mock('@/lib/session', () => ({
  sessionHas: mocks.sessionHas,
  SESSION_COOKIE_NAME: 'user_session',
  cookieOptions: vi.fn(),
  signSession: vi.fn(),
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

import { upsertRoleGrant, upsertUserOverride } from './permissions'

describe('permission mutation input validation', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.getTranslations.mockResolvedValue((key: string) => key)
    mocks.requireLiveSession.mockResolvedValue({
      discordId: '123456789012345678',
    })
    mocks.sessionHas.mockReturnValue(true)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
  })

  it('rejects oversized role capability strings before writing', async () => {
    const from = vi.fn()
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(
      upsertRoleGrant({
        discordRoleId: '123456789012345678',
        discordRoleName: 'Officer',
        capabilities: '9'.repeat(20),
      }),
    ).resolves.toEqual({ error: 'invalidInput' })

    expect(from).not.toHaveBeenCalled()
  })

  it('rejects oversized user override capability strings before writing', async () => {
    const from = vi.fn()
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(
      upsertUserOverride({
        discordId: '123456789012345678',
        capabilitiesGranted: '1',
        capabilitiesRevoked: '9'.repeat(20),
        reason: 'Temporary incident response',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).resolves.toEqual({ error: 'invalidInput' })

    expect(from).not.toHaveBeenCalled()
  })

  it('rejects contradictory grants and revocations before writing', async () => {
    const from = vi.fn()
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(
      upsertUserOverride({
        discordId: '223456789012345678',
        capabilitiesGranted: '8',
        capabilitiesRevoked: '8',
        reason: 'Temporary incident response',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).resolves.toEqual({ error: 'permissionConflict' })

    expect(from).not.toHaveBeenCalled()
  })

  it('prevents an operator from revoking their own permission-management capability', async () => {
    const from = vi.fn()
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(
      upsertUserOverride({
        discordId: '123456789012345678',
        capabilitiesGranted: '0',
        capabilitiesRevoked: String(1n << 21n),
        reason: 'Temporary incident response',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    ).resolves.toEqual({ error: 'selfLockout' })

    expect(from).not.toHaveBeenCalled()
  })
})
