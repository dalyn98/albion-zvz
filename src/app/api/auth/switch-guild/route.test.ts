import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireLiveSession: vi.fn(),
  listAccessibleGuildMemberships: vi.fn(),
  getTenantDiscordConfig: vi.fn(),
  getGuildMemberByBot: vi.fn(),
  buildDiscordMemberSession: vi.fn(),
  signHopToken: vi.fn(),
  signSession: vi.fn(),
  classifyHost: vi.fn(),
  buildTenantHostUrl: vi.fn(),
  canShareAuthBindingCookie: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireLiveSession: mocks.requireLiveSession,
}))
vi.mock('@/lib/guild-member-directory', () => ({
  listAccessibleGuildMemberships: mocks.listAccessibleGuildMemberships,
}))
vi.mock('@/lib/tenant', () => ({
  getTenantDiscordConfig: mocks.getTenantDiscordConfig,
}))
vi.mock('@/lib/discord', () => ({
  getGuildMemberByBot: mocks.getGuildMemberByBot,
}))
vi.mock('@/lib/discord-member-session', () => ({
  buildDiscordMemberSession: mocks.buildDiscordMemberSession,
}))
vi.mock('@/lib/oauth-state', () => ({
  signHopToken: mocks.signHopToken,
}))
vi.mock('@/lib/session', () => ({
  SESSION_COOKIE_NAME: 'agm_session',
  cookieOptions: () => ({ path: '/', httpOnly: true }),
  signSession: mocks.signSession,
}))
vi.mock('@/lib/last-guild-cookie', () => ({
  LAST_GUILD_COOKIE: 'agm_last_guild',
  lastGuildCookieOptions: () => ({ path: '/' }),
}))
vi.mock('@/lib/tenant-resolver', () => ({
  classifyHost: mocks.classifyHost,
  buildTenantHostUrl: mocks.buildTenantHostUrl,
}))
vi.mock('@/lib/auth-flow-cookie', () => ({
  AUTH_FLOW_BINDING_COOKIE_VALUE: '1',
  canShareAuthBindingCookie: mocks.canShareAuthBindingCookie,
  hopTokenBindingCookieName: (flowId: string) => `hop_${flowId}`,
  hopTokenBindingCookieOptions: () => ({
    path: '/',
    httpOnly: true,
  }),
}))

import { POST } from './route'

const currentGuildId = '11111111-1111-4111-8111-111111111111'
const targetGuildId = '22222222-2222-4222-8222-222222222222'

function request(
  input: {
    origin?: string
    host?: string
    guildId?: string
  } = {},
) {
  const origin = input.origin ?? 'https://alpha.albion-guildmanager.com'
  const host = input.host ?? 'alpha.albion-guildmanager.com'
  return new NextRequest(`${origin}/api/auth/switch-guild`, {
    method: 'POST',
    headers: {
      origin,
      host,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      guildId: input.guildId ?? targetGuildId,
      returnTo: '/events',
    }),
  })
}

describe('POST /api/auth/switch-guild', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireLiveSession.mockResolvedValue({
      discordId: '711111111111111111',
      guildId: currentGuildId,
      isMember: true,
      isGuest: false,
      isLocalGuildAccount: false,
    })
    mocks.listAccessibleGuildMemberships.mockResolvedValue([
      {
        guildId: targetGuildId,
        guildMemberId: '33333333-3333-4333-8333-333333333333',
        slug: 'beta',
        name: 'Beta Guild',
      },
    ])
    mocks.getTenantDiscordConfig.mockResolvedValue({
      id: targetGuildId,
      discordGuildId: '987654321098765432',
      slug: 'beta',
      name: 'Beta Guild',
      botInstalled: true,
    })
    mocks.getGuildMemberByBot.mockResolvedValue({
      user: {
        id: '711111111111111111',
        username: 'member',
        global_name: 'Member',
        avatar: null,
      },
      nick: 'Member',
      roles: ['member-role'],
    })
    mocks.buildDiscordMemberSession.mockResolvedValue({
      mode: 'member',
      preferredLocale: 'ko',
      session: {
        discordId: '711111111111111111',
        guildId: targetGuildId,
        isMember: true,
      },
    })
    mocks.classifyHost.mockReturnValue({ kind: 'tenant', slug: 'alpha' })
    mocks.buildTenantHostUrl.mockImplementation(
      (slug: string, path: string) =>
        `https://${slug}.albion-guildmanager.com${path}`,
    )
    mocks.canShareAuthBindingCookie.mockReturnValue(true)
    mocks.signHopToken.mockResolvedValue('signed-hop')
    mocks.signSession.mockResolvedValue('signed-session')
  })

  it('rejects a cross-origin form before reading the session', async () => {
    const response = await POST(
      request({
        origin: 'https://evil.example',
        host: 'alpha.albion-guildmanager.com',
      }),
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('error=invalid_request')
    expect(mocks.requireLiveSession).not.toHaveBeenCalled()
  })

  it('requires an active stable membership before calling Discord', async () => {
    mocks.listAccessibleGuildMemberships.mockResolvedValue([])

    const response = await POST(request())

    expect(response.headers.get('location')).toContain(
      'error=membership_required',
    )
    expect(mocks.getGuildMemberByBot).not.toHaveBeenCalled()
  })

  it('rechecks live Discord membership instead of trusting the shadow record', async () => {
    mocks.getGuildMemberByBot.mockResolvedValue(null)

    const response = await POST(request())

    expect(response.headers.get('location')).toContain(
      'error=membership_required',
    )
    expect(mocks.buildDiscordMemberSession).not.toHaveBeenCalled()
  })

  it('uses a browser-bound signed hop between production tenant hosts', async () => {
    const response = await POST(request())

    expect(mocks.signHopToken).toHaveBeenCalledWith(
      expect.objectContaining({
        session: expect.objectContaining({ guildId: targetGuildId }),
        returnTo: '/events',
        preferredLocale: 'ko',
        requiresBrowserBinding: true,
      }),
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      'https://beta.albion-guildmanager.com/api/auth/finish?token=signed-hop',
    )
    expect(response.cookies.get('agm_session')).toBeUndefined()
    expect(response.cookies.getAll()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: expect.stringMatching(/^hop_/) }),
      ]),
    )
  })

  it('sets the target session directly only on the local single-host fallback', async () => {
    mocks.classifyHost.mockReturnValue({ kind: 'localhost' })
    const local = request({
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    })

    const response = await POST(local)

    expect(mocks.signHopToken).not.toHaveBeenCalled()
    expect(mocks.signSession).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: targetGuildId }),
    )
    expect(response.cookies.get('agm_session')?.value).toBe('signed-session')
    expect(response.headers.get('location')).toBe(
      'http://localhost:3000/events',
    )
  })
})
