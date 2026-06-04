import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  headers: vi.fn(),
  cookies: vi.fn(),
  getTranslations: vi.fn(),
  getAdminClient: vi.fn(),
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  resolveTenantBySlug: vi.fn(),
  classifyHost: vi.fn(),
  localGuildAccountsEnabled: vi.fn(),
  isAlbionServerOrNull: vi.fn(),
  normalizeLocalAccountName: vi.fn(),
  isValidLocalAccountPassword: vi.fn(),
  verifyGuildInviteCode: vi.fn(),
  findExactAlbionPlayer: vi.fn(),
  resolvePlayerRelation: vi.fn(),
  createLocalGuildAccount: vi.fn(),
  issueHashSecret: vi.fn(),
  touchLocalGuildAccountLogin: vi.fn(),
  verifySecret: vi.fn(),
  logAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: mocks.headers,
  cookies: mocks.cookies,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/auth', () => ({
  requireAnyCapability: mocks.requireAnyCapability,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
  SESSION_COOKIE_NAME: 'user_session',
  cookieOptions: vi.fn(() => ({ path: '/', httpOnly: true })),
  signSession: vi.fn(async () => 'signed-session'),
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/tenant-resolver', () => ({
  resolveTenantBySlug: mocks.resolveTenantBySlug,
  classifyHost: mocks.classifyHost,
}))

vi.mock('@/lib/app-settings', () => ({
  getAppSetting: vi.fn(),
}))

vi.mock('@/i18n/locales', () => ({
  LOCALE_COOKIE: 'NEXT_LOCALE',
  isLocale: (value: unknown) => ['ko', 'ja', 'en', 'zh'].includes(String(value)),
}))

vi.mock('@/lib/locale-cookie', () => ({
  localeCookieOptions: vi.fn(() => ({ path: '/', httpOnly: true })),
}))

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminAction,
}))

vi.mock('@/lib/local-guild-account', () => ({
  createLocalGuildAccount: mocks.createLocalGuildAccount,
  findExactAlbionPlayer: mocks.findExactAlbionPlayer,
  hashSecret: mocks.issueHashSecret,
  isLocalAccountSubject: vi.fn((value: unknown) =>
    typeof value === 'string' && value.startsWith('local:'),
  ),
  isAlbionServerOrNull: mocks.isAlbionServerOrNull,
  isValidLocalAccountPassword: mocks.isValidLocalAccountPassword,
  isValidLocalGuildInviteCode: vi.fn((value: string) =>
    value.length >= 6 &&
    value.length <= 72 &&
    !/[\u0000-\u001f\u007f]/.test(value),
  ),
  localGuildAccountsEnabled: mocks.localGuildAccountsEnabled,
  normalizeLocalAccountName: mocks.normalizeLocalAccountName,
  resolvePlayerRelation: mocks.resolvePlayerRelation,
  touchLocalGuildAccountLogin: mocks.touchLocalGuildAccountLogin,
  verifyGuildInviteCode: mocks.verifyGuildInviteCode,
  verifySecret: mocks.verifySecret,
}))

import { loginLocalGuildAccount, registerLocalGuildAccount } from './local-guild-account'

function createEmptyAccountDb() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    is: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
  }
  return {
    from: vi.fn((table: string) => {
      if (table !== 'guild_local_accounts') throw new Error(`unexpected table: ${table}`)
      return query
    }),
  }
}

describe('local guild account actions', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()

    mocks.headers.mockResolvedValue({ get: vi.fn(() => 'menhera.example.test') })
    mocks.cookies.mockResolvedValue({ set: vi.fn() })
    mocks.getTranslations.mockResolvedValue((key: string) => key)
    mocks.classifyHost.mockReturnValue({ kind: 'tenant', slug: 'menhera' })
    mocks.resolveTenantBySlug.mockResolvedValue({ tenantId: 'guild-1', slug: 'menhera' })
    mocks.localGuildAccountsEnabled.mockResolvedValue(true)
    mocks.isAlbionServerOrNull.mockImplementation((value: string) =>
      ['east', 'west', 'europe'].includes(value) ? value : null,
    )
    mocks.normalizeLocalAccountName.mockImplementation((value: string) => value.trim())
    mocks.isValidLocalAccountPassword.mockImplementation((value: string) =>
      value.length >= 8 &&
      value.length <= 72 &&
      !/[\u0000-\u001f\u007f]/.test(value),
    )
    mocks.verifyGuildInviteCode.mockResolvedValue(false)
    mocks.getAdminClient.mockReturnValue(createEmptyAccountDb())
  })

  it('rejects invalid login passwords before reading local account rows', async () => {
    await expect(
      loginLocalGuildAccount({
        server: 'west',
        nickname: 'PlayerOne',
        password: 'x'.repeat(73),
        locale: 'ko',
        returnTo: '/me',
      }),
    ).resolves.toEqual({ error: 'invalidLogin' })

    expect(mocks.getAdminClient).not.toHaveBeenCalled()
    expect(mocks.verifySecret).not.toHaveBeenCalled()
  })

  it('rejects invalid invite codes before verification or Albion lookup', async () => {
    await expect(
      registerLocalGuildAccount({
        server: 'west',
        nickname: 'PlayerOne',
        password: 'valid-pass',
        guildCode: 'x'.repeat(73),
        locale: 'ko',
        returnTo: '/me',
      }),
    ).resolves.toEqual({ error: 'invalidGuildCode' })

    expect(mocks.verifyGuildInviteCode).not.toHaveBeenCalled()
    expect(mocks.findExactAlbionPlayer).not.toHaveBeenCalled()
  })
})
