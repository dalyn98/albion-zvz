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
  hasHopTokenBindingCookie: vi.fn(),
  hopTokenBindingCookieName: vi.fn(),
  expiredHopTokenBindingCookieOptions: vi.fn(),
}))

vi.mock('@/lib/session', () => ({
  SESSION_COOKIE_NAME: 'user_session',
  cookieOptions: mocks.cookieOptions,
  signSession: mocks.signSession,
}))

vi.mock('@/lib/oauth-state', () => ({
  verifyHopToken: mocks.verifyHopToken,
}))

vi.mock('@/lib/auth-flow-cookie', () => ({
  hasHopTokenBindingCookie: mocks.hasHopTokenBindingCookie,
  hopTokenBindingCookieName: mocks.hopTokenBindingCookieName,
  expiredHopTokenBindingCookieOptions: mocks.expiredHopTokenBindingCookieOptions,
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
    mocks.hasHopTokenBindingCookie.mockReturnValue(true)
    mocks.hopTokenBindingCookieName.mockImplementation(
      (flowId: string) => `agm_auth_hop_${flowId}`,
    )
    mocks.expiredHopTokenBindingCookieOptions.mockReturnValue({
      path: '/',
      httpOnly: true,
      maxAge: 0,
    })
  })

  it('sets the tenant session and redirects to a safe in-app path', async () => {
    mocks.verifyHopToken.mockResolvedValue({
      session,
      returnTo: '/me',
      preferredLocale: 'ko',
      flowId: 'flow-1',
      requiresBrowserBinding: true,
    })

    const response = await GET(
      new NextRequest('https://menhera.example.test/api/auth/finish?token=hop-token', {
        headers: { host: 'menhera.example.test' },
      }),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('https://menhera.example.test/me')
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
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
      flowId: 'flow-1',
      requiresBrowserBinding: true,
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
      flowId: 'flow-1',
      requiresBrowserBinding: true,
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

  it('rejects a valid hop token that is missing this browser binding', async () => {
    mocks.verifyHopToken.mockResolvedValue({
      session,
      returnTo: '/me',
      preferredLocale: 'ko',
      flowId: 'flow-1',
      requiresBrowserBinding: true,
    })
    mocks.hasHopTokenBindingCookie.mockReturnValue(false)

    const response = await GET(
      new NextRequest('https://menhera.example.test/api/auth/finish?token=hop-token', {
        headers: { host: 'menhera.example.test' },
      }),
    )

    expect(response.headers.get('location')).toBe(
      'https://menhera.example.test/login?returnTo=%2F&auth_error=hop_replayed',
    )
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(mocks.signSession).not.toHaveBeenCalled()
  })

  it('does not consume a valid browser binding on the wrong host', async () => {
    mocks.verifyHopToken.mockResolvedValue({
      session,
      returnTo: '/me',
      preferredLocale: 'ko',
      flowId: 'flow-1',
      requiresBrowserBinding: true,
    })
    mocks.classifyHost.mockReturnValue({ kind: 'root' })

    const response = await GET(
      new NextRequest('https://example.test/api/auth/finish?token=hop-token', {
        headers: {
          cookie: 'agm_auth_hop_flow-1=1',
          host: 'example.test',
        },
      }),
    )

    expect(response.headers.get('location')).toBe(
      'https://example.test/login?returnTo=%2F&auth_error=hop_wrong_host',
    )
    expect(response.cookies.get('agm_auth_hop_flow-1')).toBeUndefined()
    expect(mocks.signSession).not.toHaveBeenCalled()
  })

  it('allows a short-lived host-checked hop when cookie domains cannot be shared', async () => {
    mocks.verifyHopToken.mockResolvedValue({
      session,
      returnTo: '/me',
      preferredLocale: 'ko',
      flowId: 'flow-cross-host',
      requiresBrowserBinding: false,
    })
    mocks.hasHopTokenBindingCookie.mockReturnValue(false)

    const response = await GET(
      new NextRequest('https://menhera.example.test/api/auth/finish?token=hop-token', {
        headers: { host: 'menhera.example.test' },
      }),
    )

    expect(response.headers.get('location')).toBe('https://menhera.example.test/me')
    expect(mocks.hasHopTokenBindingCookie).not.toHaveBeenCalled()
    expect(mocks.signSession).toHaveBeenCalled()
  })
})
