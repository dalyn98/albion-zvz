import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111'
const BROWSER_SECRET = 'a'.repeat(43)

const mocks = vi.hoisted(() => {
  const lookupMaybeSingle = vi.fn()
  const lookupSecret = vi.fn(() => ({ maybeSingle: lookupMaybeSingle }))
  const lookupGuild = vi.fn(() => ({ eq: lookupSecret }))
  const lookupId = vi.fn(() => ({ eq: lookupGuild }))
  const lookupSelect = vi.fn(() => ({ eq: lookupId }))

  const consumeMaybeSingle = vi.fn()
  const consumeSelect = vi.fn(() => ({ maybeSingle: consumeMaybeSingle }))
  const consumeGt = vi.fn(() => ({ select: consumeSelect }))
  const consumeIs = vi.fn(() => ({ gt: consumeGt }))
  const consumeApproved = vi.fn(() => ({ is: consumeIs }))
  const consumeSecret = vi.fn(() => ({ eq: consumeApproved }))
  const consumeGuild = vi.fn(() => ({ eq: consumeSecret }))
  const consumeId = vi.fn(() => ({ eq: consumeGuild }))
  const consumeUpdate = vi.fn(() => ({ eq: consumeId }))

  return {
    buildSession: vi.fn(),
    consumeMaybeSingle,
    consumeUpdate,
    getGuildMemberByBot: vi.fn(),
    getTenantDiscordConfig: vi.fn(),
    lookupMaybeSingle,
    lookupSelect,
    resolveTenantBySlug: vi.fn(),
    signSession: vi.fn(),
  }
})

vi.mock('@/lib/discord-browser-auth', () => ({
  DISCORD_BROWSER_AUTH_COOKIE: 'agm_discord_browser_auth',
  discordBrowserAuthCookieOptions: (maxAge: number) => ({
    httpOnly: true,
    sameSite: 'strict',
    path: '/api/auth/discord/device',
    maxAge,
  }),
  hashDiscordBrowserAuthValue: () => 'b'.repeat(64),
  isValidDiscordBrowserAuthAttemptId: (value: unknown) => value === ATTEMPT_ID,
  parseDiscordBrowserAuthCookie: (value: string | undefined) =>
    value === `${ATTEMPT_ID}.${BROWSER_SECRET}`
      ? { attemptId: ATTEMPT_ID, browserSecret: BROWSER_SECRET }
      : null,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      select: mocks.lookupSelect,
      update: mocks.consumeUpdate,
    }),
  }),
}))

vi.mock('@/lib/tenant-resolver', () => ({
  FALLBACK_TENANT_SLUG: 'menhera',
  classifyHost: () => ({ kind: 'tenant', slug: 'menhera' }),
  resolveTenantBySlug: mocks.resolveTenantBySlug,
}))

vi.mock('@/lib/tenant', () => ({
  getTenantDiscordConfig: mocks.getTenantDiscordConfig,
}))

vi.mock('@/lib/discord', () => ({
  getGuildMemberByBot: mocks.getGuildMemberByBot,
}))

vi.mock('@/lib/discord-member-session', () => ({
  buildDiscordMemberSession: mocks.buildSession,
  resolveDiscordMemberPostLoginPath: (returnTo: string) => returnTo,
}))

vi.mock('@/lib/session', () => ({
  SESSION_COOKIE_NAME: 'user_session',
  cookieOptions: () => ({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 604800 }),
  signSession: mocks.signSession,
}))

vi.mock('@/lib/last-guild-cookie', () => ({
  LAST_GUILD_COOKIE: 'agm_last_guild',
  lastGuildCookieOptions: () => ({ httpOnly: true, path: '/' }),
}))

vi.mock('@/lib/locale-cookie', () => ({
  localeCookieOptions: () => ({ path: '/' }),
}))

import { GET } from './route'

describe('GET /api/auth/discord/device/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.resolveTenantBySlug.mockResolvedValue({
      tenantId: 'guild-1',
      slug: 'menhera',
      discordGuildId: '123456789012345678',
    })
    mocks.lookupMaybeSingle.mockResolvedValue({
      data: {
        guild_id: 'guild-1',
        browser_secret_hash: 'b'.repeat(64),
        return_to: '/events/event-1?view=party',
        approved_discord_id: '123456789012345678',
        approved_at: new Date().toISOString(),
        consumed_at: null,
        expires_at: new Date(Date.now() + 300_000).toISOString(),
      },
      error: null,
    })
    mocks.getTenantDiscordConfig.mockResolvedValue({
      id: 'guild-1',
      slug: 'menhera',
      discordGuildId: '123456789012345678',
    })
    mocks.getGuildMemberByBot.mockResolvedValue({
      user: { id: '123456789012345678', username: 'Member', avatar: null },
      roles: [],
    })
    mocks.buildSession.mockResolvedValue({
      session: { guildId: 'guild-1', discordId: '123456789012345678' },
      preferredLocale: null,
      mode: 'member',
    })
    mocks.consumeMaybeSingle.mockResolvedValue({ data: { id: ATTEMPT_ID }, error: null })
    mocks.signSession.mockResolvedValue('signed-session')
  })

  it('rechecks membership, consumes once, and sets the session on the original browser', async () => {
    const response = await GET(new NextRequest(
      `https://menhera.example.test/api/auth/discord/device/status?id=${ATTEMPT_ID}`,
      {
        headers: {
          host: 'menhera.example.test',
          cookie: `agm_discord_browser_auth=${ATTEMPT_ID}.${BROWSER_SECRET}`,
        },
      },
    ))
    const body = await response.json()

    expect(body).toEqual({
      ok: true,
      status: 'complete',
      redirectTo: '/events/event-1?view=party',
    })
    expect(mocks.getGuildMemberByBot).toHaveBeenCalledWith(
      '123456789012345678',
      '123456789012345678',
    )
    expect(mocks.consumeUpdate).toHaveBeenCalledWith({ consumed_at: expect.any(String) })
    expect(response.cookies.get('user_session')?.value).toBe('signed-session')
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
  })

  it('does not reveal attempt state without the browser binding', async () => {
    const response = await GET(new NextRequest(
      `https://menhera.example.test/api/auth/discord/device/status?id=${ATTEMPT_ID}`,
      { headers: { host: 'menhera.example.test' } },
    ))

    expect(response.status).toBe(401)
    expect(mocks.lookupSelect).not.toHaveBeenCalled()
    expect(mocks.getGuildMemberByBot).not.toHaveBeenCalled()
  })
})
