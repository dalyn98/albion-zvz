import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signSession: vi.fn(),
  cookieOptions: vi.fn(),
  classifyHost: vi.fn(),
  getTenantDiscordConfig: vi.fn(),
}))

vi.mock('@/lib/session', () => ({
  SESSION_COOKIE_NAME: 'user_session',
  cookieOptions: mocks.cookieOptions,
  getSession: mocks.getSession,
  signSession: mocks.signSession,
}))

vi.mock('@/lib/tenant-resolver', () => ({
  classifyHost: mocks.classifyHost,
}))

vi.mock('@/lib/tenant', () => ({
  getTenantDiscordConfig: mocks.getTenantDiscordConfig,
}))

import { POST } from './route'

const baseSession = {
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

  it('requires an explicit refresh header before touching the session', async () => {
    const response = await POST(request())

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ ok: false, error: 'missing_refresh_header' })
    expect(mocks.getSession).not.toHaveBeenCalled()
  })

  it('rejects missing or expired sessions', async () => {
    mocks.getSession.mockResolvedValue(null)

    const response = await POST(request({ 'x-agm-session-refresh': '1' }))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ ok: false, error: 'unauthorized' })
    expect(mocks.signSession).not.toHaveBeenCalled()
  })

  it('re-signs a valid tenant session with a fresh issuedAt', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T00:00:00.000Z'))
    mocks.getSession.mockResolvedValue(baseSession)

    try {
      const response = await POST(request({ 'x-agm-session-refresh': '1' }))
      const setCookies = response.headers.getSetCookie()

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true, refreshedAt: Date.now() })
      expect(mocks.signSession).toHaveBeenCalledWith({
        ...baseSession,
        issuedAt: Date.now(),
      })
      expect(setCookies.some((cookie) => cookie.startsWith('user_session=refreshed-session;'))).toBe(true)
      expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    } finally {
      vi.useRealTimers()
    }
  })

  it('rejects tenant host mismatch before re-signing', async () => {
    mocks.getSession.mockResolvedValue(baseSession)
    mocks.getTenantDiscordConfig.mockResolvedValue({
      id: 'guild-1',
      slug: 'other-guild',
      name: 'Other',
      discordGuildId: 'discord-guild-2',
    })

    const response = await POST(request({ 'x-agm-session-refresh': '1' }))

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ ok: false, error: 'session_not_refreshable' })
    expect(mocks.signSession).not.toHaveBeenCalled()
  })

  it('does not refresh guest sessions', async () => {
    mocks.getSession.mockResolvedValue({ ...baseSession, isGuest: true, isMember: false })

    const response = await POST(request({ 'x-agm-session-refresh': '1' }))

    expect(response.status).toBe(403)
    expect(mocks.signSession).not.toHaveBeenCalled()
  })
})
