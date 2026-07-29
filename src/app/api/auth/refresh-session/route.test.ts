import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  verifySession: vi.fn(),
  resolveLiveDiscordAuthorization: vi.fn(),
  signSession: vi.fn(),
  cookieOptions: vi.fn(),
  classifyHost: vi.fn(),
  getTenantDiscordConfig: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
}))

vi.mock('@/lib/session', () => ({
  SESSION_COOKIE_NAME: 'user_session',
  cookieOptions: mocks.cookieOptions,
  signSession: mocks.signSession,
  verifySession: mocks.verifySession,
}))

vi.mock('@/lib/discord-live-authorization', () => ({
  resolveLiveDiscordAuthorization: mocks.resolveLiveDiscordAuthorization,
}))

vi.mock('@/lib/tenant-resolver', () => ({
  classifyHost: mocks.classifyHost,
}))

vi.mock('@/lib/tenant', () => ({
  getTenantDiscordConfig: mocks.getTenantDiscordConfig,
}))

import { POST } from './route'

const baseSession = {
  discordId: '123456789012345678',
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

function request(headers: Record<string, string> = {}) {
  return new NextRequest('https://menhera.example.test/api/auth/refresh-session', {
    method: 'POST',
    headers: {
      host: 'menhera.example.test',
      ...headers,
    },
  })
}

describe('POST /api/auth/refresh-session', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => ({ value: 'signed-stale-snapshot' })),
    })
    mocks.verifySession.mockResolvedValue(baseSession)
    mocks.resolveLiveDiscordAuthorization.mockResolvedValue({
      session: baseSession,
      tenant: { id: 'guild-1' },
      discordRoleIds: [],
    })
    mocks.signSession.mockResolvedValue('refreshed-session')
    mocks.cookieOptions.mockReturnValue({ path: '/', httpOnly: true })
    mocks.classifyHost.mockReturnValue({ kind: 'tenant', slug: 'menhera' })
    mocks.getTenantDiscordConfig.mockResolvedValue({
      id: 'guild-1',
      slug: 'menhera',
      name: 'Menhera',
      discordGuildId: 'discord-guild-1',
    })
  })

  it('requires an explicit refresh header before reading the cookie', async () => {
    const response = await POST(request())

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'missing_refresh_header',
    })
    expect(mocks.cookies).not.toHaveBeenCalled()
  })

  it('rejects a cookie with an invalid or expired signature', async () => {
    mocks.verifySession.mockResolvedValue(null)

    const response = await POST(
      request({ 'x-agm-session-refresh': '1' }),
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'unauthorized',
    })
    expect(mocks.signSession).not.toHaveBeenCalled()
  })

  it('recomputes current Discord access before issuing a fresh snapshot', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T00:00:00.000Z'))
    const liveSession = {
      ...baseSession,
      isAdmin: true,
      capabilities: '34359738367',
    }
    mocks.resolveLiveDiscordAuthorization.mockResolvedValue({
      session: liveSession,
      tenant: { id: 'guild-1' },
      discordRoleIds: ['role-1'],
    })

    try {
      const response = await POST(
        request({ 'x-agm-session-refresh': '1' }),
      )
      const setCookies = response.headers.getSetCookie()

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        ok: true,
        refreshedAt: Date.now(),
      })
      expect(mocks.verifySession).toHaveBeenCalledWith(
        'signed-stale-snapshot',
      )
      expect(mocks.resolveLiveDiscordAuthorization).toHaveBeenCalledWith(
        baseSession,
      )
      expect(mocks.signSession).toHaveBeenCalledWith({
        ...liveSession,
        issuedAt: Date.now(),
      })
      expect(
        setCookies.some((cookie) =>
          cookie.startsWith('user_session=refreshed-session;'),
        ),
      ).toBe(true)
      expect(response.headers.get('cache-control')).toBe(
        'no-store, max-age=0',
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects a tenant host mismatch before live reauthorization', async () => {
    mocks.getTenantDiscordConfig.mockResolvedValue({
      id: 'guild-1',
      slug: 'other-guild',
      name: 'Other',
      discordGuildId: 'discord-guild-2',
    })

    const response = await POST(
      request({ 'x-agm-session-refresh': '1' }),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'session_not_refreshable',
    })
    expect(mocks.resolveLiveDiscordAuthorization).not.toHaveBeenCalled()
  })

  it('does not refresh guest sessions', async () => {
    mocks.verifySession.mockResolvedValue({
      ...baseSession,
      isGuest: true,
      isMember: false,
    })

    const response = await POST(
      request({ 'x-agm-session-refresh': '1' }),
    )

    expect(response.status).toBe(403)
    expect(mocks.signSession).not.toHaveBeenCalled()
  })

  it('rejects a member removed from Discord instead of re-signing stale access', async () => {
    mocks.resolveLiveDiscordAuthorization.mockResolvedValue(null)

    const response = await POST(
      request({ 'x-agm-session-refresh': '1' }),
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      ok: false,
      error: 'discord_membership_required',
    })
    expect(mocks.signSession).not.toHaveBeenCalled()
  })
})
