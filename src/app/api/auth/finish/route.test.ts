import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  verifyHopToken: vi.fn(),
  signSession: vi.fn(),
  cookieOptions: vi.fn(),
  classifyHost: vi.fn(),
  getTenantDiscordConfig: vi.fn(),
  lastGuildCookieOptions: vi.fn(),
  localeCookieOptions: vi.fn(),
  recordAuthFailure: vi.fn(),
  recordAuthSuccess: vi.fn(),
}))

vi.mock('@/lib/session', () => ({
  SESSION_COOKIE_NAME: 'user_session',
  cookieOptions: mocks.cookieOptions,
  signSession: mocks.signSession,
}))

vi.mock('@/lib/oauth-state', () => ({
  verifyHopToken: mocks.verifyHopToken,
}))

vi.mock('@/lib/tenant-resolver', () => ({
  classifyHost: mocks.classifyHost,
}))

vi.mock('@/lib/tenant', () => ({
  getTenantDiscordConfig: mocks.getTenantDiscordConfig,
}))

vi.mock('@/lib/last-guild-cookie', () => ({
  LAST_GUILD_COOKIE: 'last_guild',
  lastGuildCookieOptions: mocks.lastGuildCookieOptions,
}))

vi.mock('@/i18n/locales', () => ({
  LOCALE_COOKIE: 'NEXT_LOCALE',
  isLocale: (value: unknown) => ['ko', 'ja', 'en', 'zh'].includes(String(value)),
}))

vi.mock('@/lib/locale-cookie', () => ({
  localeCookieOptions: mocks.localeCookieOptions,
}))

vi.mock('@/lib/auth-telemetry', () => ({
  createAuthTimer: () => () => 0,
  recordAuthFailure: mocks.recordAuthFailure,
  recordAuthSuccess: mocks.recordAuthSuccess,
}))

import { GET } from './route'

const session = {
  discordId: 'user-1',
  username: 'User',
  avatar: null,
  isMember: true,
  isAdmin: false,
  isGuest: false,
  isBombSquadCaller: false,
  isLocalGuildAccount: false,
  isAllianceCandidate: false,
  canCreateEvents: false,
  eventCreatorCategories: [],
  eventScope: null,
  guildId: 'guild-1',
  capabilities: '0',
  issuedAt: 1,
}

describe('GET /api/auth/finish', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()

    mocks.signSession.mockResolvedValue('signed-session')
    mocks.cookieOptions.mockReturnValue({ path: '/', httpOnly: true })
    mocks.classifyHost.mockReturnValue({ kind: 'tenant', slug: 'menhera' })
    mocks.getTenantDiscordConfig.mockResolvedValue({
      id: 'guild-1',
      slug: 'menhera',
      name: 'Menhera',
      discordGuildId: 'discord-guild-1',
    })
    mocks.lastGuildCookieOptions.mockReturnValue({ path: '/', httpOnly: true })
    mocks.localeCookieOptions.mockReturnValue({ path: '/', httpOnly: true })
  })

  it('sets the tenant session and redirects to a safe in-app path', async () => {
    mocks.verifyHopToken.mockResolvedValue({
      session,
      returnTo: '/me',
      preferredLocale: 'ko',
    })

    const response = await GET(
      new NextRequest('https://menhera.example.test/api/auth/finish?token=hop-token', {
        headers: { host: 'menhera.example.test' },
      }),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://menhera.example.test/me')
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(mocks.signSession).toHaveBeenCalledWith(expect.objectContaining({
      guildId: 'guild-1',
      issuedAt: expect.any(Number),
    }))
    expect(mocks.recordAuthSuccess).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'finish',
      expect.objectContaining({
        tenant_id: 'guild-1',
        return_to: '/me',
      }),
    )
  })

  it('normalizes api returnTo values before the final redirect', async () => {
    mocks.verifyHopToken.mockResolvedValue({
      session,
      returnTo: '/api/auth/logout',
      preferredLocale: null,
    })

    const response = await GET(
      new NextRequest('https://menhera.example.test/api/auth/finish?token=hop-token', {
        headers: { host: 'menhera.example.test' },
      }),
    )

    expect(response.headers.get('location')).toBe('https://menhera.example.test/')
    expect(mocks.recordAuthSuccess).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'finish',
      expect.objectContaining({ return_to: '/' }),
    )
  })

  it('normalizes backslash returnTo values before the final redirect', async () => {
    mocks.verifyHopToken.mockResolvedValue({
      session,
      returnTo: '/\\evil.test/path',
      preferredLocale: null,
    })

    const response = await GET(
      new NextRequest('https://menhera.example.test/api/auth/finish?token=hop-token', {
        headers: { host: 'menhera.example.test' },
      }),
    )

    expect(response.headers.get('location')).toBe('https://menhera.example.test/')
    expect(mocks.recordAuthSuccess).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'finish',
      expect.objectContaining({ return_to: '/' }),
    )
  })
})
