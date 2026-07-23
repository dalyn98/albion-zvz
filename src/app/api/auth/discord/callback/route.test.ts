import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  buildAuthorizeUrl: vi.fn(),
  exchangeCode: vi.fn(),
  getCurrentUser: vi.fn(),
  getGuildMemberByBot: vi.fn(),
  identityFromMember: vi.fn(),
  listUserGuilds: vi.fn(),
  mapDiscordLocale: vi.fn(),
  signSession: vi.fn(),
  cookieOptions: vi.fn(),
  resolveUserCapabilities: vi.fn(),
  serializeCapabilities: vi.fn(),
  upsertGuildAvatar: vi.fn(),
  getAppSetting: vi.fn(),
  getAdminClient: vi.fn(),
  resolveTenantLoginAccess: vi.fn(),
  getPrimaryTenantId: vi.fn(),
  getTenantDiscordConfig: vi.fn(),
  getTenantDiscordConfigsByDiscordGuildIds: vi.fn(),
  recordAdminLogin: vi.fn(),
  signHopToken: vi.fn(),
  signOAuthState: vi.fn(),
  verifyOAuthState: vi.fn(),
  buildTenantHostUrl: vi.fn(),
  classifyHost: vi.fn(),
  resolveTenantBySlug: vi.fn(),
  recordAuthFailure: vi.fn(),
  recordAuthSuccess: vi.fn(),
  logError: vi.fn(),
  removeGuestRecordForMember: vi.fn(),
  resolveAuthTargetTenant: vi.fn(),
  canShareAuthBindingCookie: vi.fn(),
  hasOAuthStateBindingCookie: vi.fn(),
  hopTokenBindingCookieName: vi.fn(),
  hopTokenBindingCookieOptions: vi.fn(),
  oauthStateBindingCookieName: vi.fn(),
  oauthStateBindingCookieOptions: vi.fn(),
  expiredOAuthStateBindingCookieOptions: vi.fn(),
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: mocks.after,
  }
})

vi.mock('@/lib/discord', () => ({
  buildAuthorizeUrl: mocks.buildAuthorizeUrl,
  exchangeCode: mocks.exchangeCode,
  getCurrentUser: mocks.getCurrentUser,
  getGuildMemberByBot: mocks.getGuildMemberByBot,
  identityFromMember: mocks.identityFromMember,
  listUserGuilds: mocks.listUserGuilds,
  mapDiscordLocale: mocks.mapDiscordLocale,
}))

vi.mock('@/lib/session', () => ({
  SESSION_COOKIE_NAME: 'user_session',
  cookieOptions: mocks.cookieOptions,
  signSession: mocks.signSession,
}))

vi.mock('@/lib/permissions', () => ({
  resolveUserCapabilities: mocks.resolveUserCapabilities,
  serializeCapabilities: mocks.serializeCapabilities,
}))

vi.mock('@/lib/discord-avatar', () => ({
  upsertGuildAvatar: mocks.upsertGuildAvatar,
}))

vi.mock('@/lib/app-settings', () => ({
  getAppSetting: mocks.getAppSetting,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/tenant-login-access', () => ({
  resolveTenantLoginAccess: mocks.resolveTenantLoginAccess,
}))

vi.mock('@/lib/tenant', () => ({
  getPrimaryTenantId: mocks.getPrimaryTenantId,
  getTenantDiscordConfig: mocks.getTenantDiscordConfig,
  getTenantDiscordConfigsByDiscordGuildIds: mocks.getTenantDiscordConfigsByDiscordGuildIds,
}))

vi.mock('@/i18n/locales', () => ({
  isLocale: (value: unknown) => ['ko', 'ja', 'en', 'zh'].includes(String(value)),
}))

vi.mock('@/lib/tenant-activity', () => ({
  recordAdminLogin: mocks.recordAdminLogin,
}))

vi.mock('@/lib/oauth-state', () => ({
  signHopToken: mocks.signHopToken,
  signOAuthState: mocks.signOAuthState,
  verifyOAuthState: mocks.verifyOAuthState,
}))

vi.mock('@/lib/auth-target-tenant', () => ({
  resolveAuthTargetTenant: mocks.resolveAuthTargetTenant,
}))

vi.mock('@/lib/auth-flow-cookie', () => ({
  AUTH_FLOW_BINDING_COOKIE_VALUE: '1',
  canShareAuthBindingCookie: mocks.canShareAuthBindingCookie,
  hasOAuthStateBindingCookie: mocks.hasOAuthStateBindingCookie,
  hopTokenBindingCookieName: mocks.hopTokenBindingCookieName,
  hopTokenBindingCookieOptions: mocks.hopTokenBindingCookieOptions,
  oauthStateBindingCookieName: mocks.oauthStateBindingCookieName,
  oauthStateBindingCookieOptions: mocks.oauthStateBindingCookieOptions,
  expiredOAuthStateBindingCookieOptions: mocks.expiredOAuthStateBindingCookieOptions,
}))

vi.mock('@/lib/tenant-resolver', () => ({
  buildTenantHostUrl: mocks.buildTenantHostUrl,
  classifyHost: mocks.classifyHost,
  resolveTenantBySlug: mocks.resolveTenantBySlug,
  FALLBACK_TENANT_SLUG: 'menhera',
}))

vi.mock('@/lib/auth-telemetry', () => ({
  createAuthTimer: () => () => 0,
  recordAuthFailure: mocks.recordAuthFailure,
  recordAuthSuccess: mocks.recordAuthSuccess,
}))

vi.mock('@/lib/log', () => ({
  log: {
    error: mocks.logError,
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

vi.mock('@/lib/guest-membership-transition', () => ({
  removeGuestRecordForMember: mocks.removeGuestRecordForMember,
}))

import { GET } from './route'

async function runDeferredTask(index = 0): Promise<void> {
  const task = mocks.after.mock.calls[index]?.[0] as (() => Promise<void> | void) | undefined
  expect(task).toBeDefined()
  await task?.()
}

function createDb(options: {
  guestRevoked?: boolean
} = {}) {
  return {
    from(table: string) {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          if (table === 'event_guest_tokens') {
            return {
              data: {
                event_id: 'event-1',
                guild_id: 'guild-1',
                revoked_at: null,
                expires_at: '2999-01-01T00:00:00.000Z',
              },
              error: null,
            }
          }
          if (table === 'events') {
            return { data: { guild_id: 'guild-1', status: 'published' }, error: null }
          }
          if (table === 'guests') {
            return { data: null, error: null }
          }
          if (table === 'guest_revocations') {
            return {
              data: options.guestRevoked ? { discord_id: 'guest-1' } : null,
              error: null,
            }
          }
          return { data: null, error: null }
        }),
        insert: vi.fn(async () => ({ error: null })),
        update: vi.fn(() => chain),
      }
      return chain
    },
  }
}

describe('GET /api/auth/discord/callback', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()

    mocks.after.mockImplementation(() => undefined)
    mocks.exchangeCode.mockResolvedValue({ access_token: 'discord-token' })
    mocks.getCurrentUser.mockResolvedValue({
      id: 'guest-1',
      username: 'GuestUser',
      global_name: 'Guest User',
      avatar: null,
      locale: 'en-US',
    })
    mocks.listUserGuilds.mockResolvedValue([
      {
        id: 'external-discord-guild',
        name: 'External Guild',
        icon: null,
        owner: false,
        permissions: String(0x20),
      },
    ])
    mocks.getTenantDiscordConfigsByDiscordGuildIds.mockResolvedValue(new Map())
    mocks.getTenantDiscordConfig.mockResolvedValue({
      id: 'guild-1',
      discordGuildId: 'discord-guild-1',
      slug: 'menhera',
      name: 'Menhera',
      createdByDiscordId: null,
      memberRoleIds: [],
      adminRoleIds: [],
      eventChannelId: null,
      botInstalled: true,
    })
    mocks.getAdminClient.mockReturnValue(createDb())
    mocks.signHopToken.mockResolvedValue('hop-token')
    mocks.resolveAuthTargetTenant.mockResolvedValue(null)
    mocks.canShareAuthBindingCookie.mockReturnValue(true)
    mocks.hasOAuthStateBindingCookie.mockReturnValue(true)
    mocks.hopTokenBindingCookieName.mockImplementation(
      (flowId: string) => `agm_auth_hop_${flowId}`,
    )
    mocks.hopTokenBindingCookieOptions.mockReturnValue({ path: '/', httpOnly: true })
    mocks.oauthStateBindingCookieName.mockImplementation(
      (flowId: string) => `agm_oauth_state_${flowId}`,
    )
    mocks.oauthStateBindingCookieOptions.mockReturnValue({ path: '/', httpOnly: true })
    mocks.expiredOAuthStateBindingCookieOptions.mockReturnValue({
      path: '/',
      httpOnly: true,
      maxAge: 0,
    })
    mocks.buildTenantHostUrl.mockImplementation(
      (slug: string, path: string) => `https://${slug}.example.test${path}`,
    )
    mocks.classifyHost.mockReturnValue({ kind: 'tenant', slug: 'menhera' })
    mocks.resolveTenantBySlug.mockResolvedValue(null)
    mocks.signSession.mockResolvedValue('session-cookie')
    mocks.cookieOptions.mockReturnValue({ path: '/', httpOnly: true })
  })

  it('turns a guest invite login into an event-scoped guest', async () => {
    mocks.verifyOAuthState.mockResolvedValue({
      nonce: 'flow-1',
      originHost: 'menhera.albion-guildmanager.com',
      returnTo: '/events/event-1?invite=guest-token',
      invite: 'guest-token',
      preferredLocale: 'en',
    })

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/callback?code=CODE&state=STATE',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://menhera.example.test/api/auth/finish?token=hop-token',
    )
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(mocks.signHopToken).toHaveBeenCalledWith({
      session: expect.objectContaining({
        discordId: 'guest-1',
        isGuest: true,
        isMember: false,
        eventScope: 'event-1',
        guildId: 'guild-1',
      }),
      returnTo: '/events/event-1',
      preferredLocale: 'en',
      flowId: 'flow-1',
      requiresBrowserBinding: true,
    })
    expect(mocks.signSession).not.toHaveBeenCalled()
    expect(mocks.recordAuthSuccess).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'callback',
      expect.objectContaining({
        mode: 'guest',
        tenant_id: 'guild-1',
        return_to: '/events/event-1?invite=guest-token',
      }),
    )
  })

  it('rejects a revoked guest even when the event invite token is still valid', async () => {
    mocks.getAdminClient.mockReturnValue(createDb({ guestRevoked: true }))
    mocks.verifyOAuthState.mockResolvedValue({
      nonce: 'flow-1',
      originHost: 'menhera.albion-guildmanager.com',
      returnTo: '/events/event-1?invite=guest-token',
      invite: 'guest-token',
      preferredLocale: 'en',
    })

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/callback?code=CODE&state=STATE',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://menhera.albion-guildmanager.com/login?returnTo=%2Fevents%2Fevent-1%3Finvite%3Dguest-token&auth_error=no_role',
    )
    expect(mocks.signHopToken).not.toHaveBeenCalled()
    expect(mocks.recordAuthFailure).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'callback',
      'no_role',
      expect.objectContaining({
        tenant_id: 'guild-1',
        event_scope: 'event-1',
        guest_revoked: true,
      }),
    )
  })

  it('does not turn a regular event login into a guest session', async () => {
    mocks.verifyOAuthState.mockResolvedValue({
      nonce: 'flow-1',
      originHost: 'menhera.albion-guildmanager.com',
      returnTo: '/events/event-1',
      invite: null,
      preferredLocale: 'en',
    })

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/callback?code=CODE&state=STATE',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://menhera.albion-guildmanager.com/login?returnTo=%2Fevents%2Fevent-1&auth_error=not_in_guild',
    )
    expect(mocks.signHopToken).not.toHaveBeenCalled()
    expect(mocks.signSession).not.toHaveBeenCalled()
    expect(mocks.recordAuthFailure).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'callback',
      'not_in_guild',
      expect.objectContaining({
        return_to: '/events/event-1',
        has_invite: false,
      }),
    )
  })

  it('keeps a direct pending setup login on the requested setup URL', async () => {
    mocks.verifyOAuthState.mockResolvedValue({
      nonce: 'flow-1',
      originHost: 'albion-guildmanager.com',
      returnTo: '/onboard/setup/tenant-pending',
      invite: null,
      preferredLocale: 'en',
    })
    mocks.listUserGuilds.mockResolvedValue([
      {
        id: 'discord-guild-1',
        name: 'Setup Guild',
        icon: null,
        owner: true,
        permissions: String(0x20),
      },
    ])

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/callback?code=CODE&state=STATE',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/onboard/setup/tenant-pending',
    )
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(mocks.signSession).toHaveBeenCalledWith(
      expect.objectContaining({
        discordId: 'guest-1',
        isAdmin: false,
        guildId: null,
      }),
    )
    expect(mocks.signHopToken).not.toHaveBeenCalled()
    expect(mocks.recordAuthSuccess).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'callback',
      expect.objectContaining({
        mode: 'onboard',
        return_to: '/onboard/setup/tenant-pending',
      }),
    )
  })

  it('keeps OAuth errors on the original event URL when signed state is valid', async () => {
    mocks.verifyOAuthState.mockResolvedValue({
      nonce: 'flow-1',
      originHost: 'menhera.albion-guildmanager.com',
      returnTo: '/events/event-1?invite=guest-token',
      invite: 'guest-token',
      preferredLocale: 'en',
    })

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/callback?error=access_denied&state=STATE',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://menhera.albion-guildmanager.com/login?returnTo=%2Fevents%2Fevent-1%3Finvite%3Dguest-token&auth_error=denied',
    )
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(mocks.recordAuthFailure).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'callback',
      'denied',
      expect.objectContaining({
        origin_host: 'menhera.albion-guildmanager.com',
        return_to: '/events/event-1?invite=guest-token',
        has_invite: true,
      }),
    )
  })

  it('issues an alliance-candidate session for Discord server users without the active member role', async () => {
    mocks.verifyOAuthState.mockResolvedValue({
      nonce: 'flow-1',
      originHost: 'menhera.albion-guildmanager.com',
      returnTo: '/',
      invite: null,
      preferredLocale: 'en',
    })
    mocks.listUserGuilds.mockResolvedValue([
      {
        id: 'discord-guild-1',
        name: 'Menhera',
        icon: null,
        owner: false,
        permissions: '0',
      },
    ])
    mocks.getTenantDiscordConfigsByDiscordGuildIds.mockResolvedValue(new Map([
      [
        'discord-guild-1',
        {
          id: 'guild-1',
          discordGuildId: 'discord-guild-1',
          slug: 'menhera',
          name: 'Menhera',
          createdByDiscordId: null,
          memberRoleIds: ['member-role'],
          adminRoleIds: [],
          eventChannelId: null,
          botInstalled: true,
        },
      ],
    ]))
    mocks.getGuildMemberByBot.mockResolvedValue({ user: null, roles: [], nick: null })
    mocks.identityFromMember.mockReturnValue(null)
    mocks.getAppSetting.mockResolvedValue('[]')
    mocks.resolveTenantLoginAccess.mockReturnValue({ isMember: false, isAdmin: false })
    mocks.mapDiscordLocale.mockReturnValue('en')
    mocks.serializeCapabilities.mockReturnValue('0')

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/callback?code=CODE&state=STATE',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://menhera.example.test/api/auth/finish?token=hop-token',
    )
    expect(mocks.signHopToken).toHaveBeenCalledWith({
      session: expect.objectContaining({
        discordId: 'guest-1',
        isMember: false,
        isGuest: false,
        isBombSquadCaller: false,
        isAllianceCandidate: true,
        guildId: 'guild-1',
      }),
      returnTo: '/',
      preferredLocale: 'en',
      flowId: 'flow-1',
      requiresBrowserBinding: true,
    })
    expect(mocks.upsertGuildAvatar).not.toHaveBeenCalled()
    expect(mocks.removeGuestRecordForMember).not.toHaveBeenCalled()
  })

  it('removes a stale guest row when the Discord login resolves to an active member', async () => {
    mocks.verifyOAuthState.mockResolvedValue({
      nonce: 'flow-1',
      originHost: 'menhera.albion-guildmanager.com',
      returnTo: '/',
      invite: null,
      preferredLocale: 'en',
    })
    mocks.listUserGuilds.mockResolvedValue([
      {
        id: 'discord-guild-1',
        name: 'Menhera',
        icon: null,
        owner: false,
        permissions: '0',
      },
    ])
    mocks.getTenantDiscordConfigsByDiscordGuildIds.mockResolvedValue(new Map([
      [
        'discord-guild-1',
        {
          id: 'guild-1',
          discordGuildId: 'discord-guild-1',
          slug: 'menhera',
          name: 'Menhera',
          createdByDiscordId: null,
          memberRoleIds: ['member-role'],
          adminRoleIds: [],
          eventChannelId: null,
          botInstalled: true,
        },
      ],
    ]))
    mocks.getGuildMemberByBot.mockResolvedValue({
      user: {
        id: 'guest-1',
        username: 'GuestUser',
        global_name: 'Guest User',
        avatar: null,
      },
      roles: ['member-role'],
      nick: 'AlbionMember',
    })
    mocks.identityFromMember.mockReturnValue({
      discordId: 'guest-1',
      username: 'AlbionMember',
      avatar: null,
      isMember: true,
      isAdmin: false,
    })
    mocks.getAppSetting.mockResolvedValue('[]')
    mocks.resolveTenantLoginAccess.mockReturnValue({ isMember: true, isAdmin: false })
    mocks.mapDiscordLocale.mockReturnValue('en')
    mocks.resolveUserCapabilities.mockResolvedValue(0n)
    mocks.serializeCapabilities.mockReturnValue('0')

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/callback?code=CODE&state=STATE',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://menhera.example.test/api/auth/finish?token=hop-token',
    )
    expect(mocks.getTenantDiscordConfigsByDiscordGuildIds).toHaveBeenCalledWith(['discord-guild-1'])
    expect(mocks.upsertGuildAvatar).toHaveBeenCalledWith(
      'guild-1',
      'guest-1',
      'AlbionMember',
      null,
      false,
      false,
      { usernameIsEffective: true },
    )
    expect(mocks.removeGuestRecordForMember).toHaveBeenCalledWith(
      expect.anything(),
      {
        guildId: 'guild-1',
        discordId: 'guest-1',
        source: 'member_login',
      },
    )
    expect(mocks.signHopToken).toHaveBeenCalledWith({
      session: expect.objectContaining({
        discordId: 'guest-1',
        isMember: true,
        isGuest: false,
        guildId: 'guild-1',
      }),
      returnTo: '/',
      preferredLocale: 'en',
      flowId: 'flow-1',
      requiresBrowserBinding: true,
    })
  })

  it('defers admin login activity recording until after the auth redirect', async () => {
    mocks.verifyOAuthState.mockResolvedValue({
      nonce: 'flow-1',
      originHost: 'menhera.albion-guildmanager.com',
      returnTo: '/',
      invite: null,
      preferredLocale: 'en',
    })
    mocks.listUserGuilds.mockResolvedValue([
      {
        id: 'discord-guild-1',
        name: 'Menhera',
        icon: null,
        owner: false,
        permissions: '0',
      },
    ])
    mocks.getTenantDiscordConfigsByDiscordGuildIds.mockResolvedValue(new Map([
      [
        'discord-guild-1',
        {
          id: 'guild-1',
          discordGuildId: 'discord-guild-1',
          slug: 'menhera',
          name: 'Menhera',
          createdByDiscordId: null,
          memberRoleIds: ['member-role'],
          adminRoleIds: ['admin-role'],
          eventChannelId: null,
          botInstalled: true,
        },
      ],
    ]))
    mocks.getGuildMemberByBot.mockResolvedValue({
      user: null,
      roles: ['member-role', 'admin-role'],
      nick: 'GuildAdmin',
    })
    mocks.identityFromMember.mockReturnValue({
      discordId: 'guest-1',
      username: 'GuildAdmin',
      avatar: null,
      isMember: true,
      isAdmin: true,
    })
    mocks.getAppSetting.mockResolvedValue('[]')
    mocks.resolveTenantLoginAccess.mockReturnValue({ isMember: true, isAdmin: true })
    mocks.mapDiscordLocale.mockReturnValue('en')
    mocks.resolveUserCapabilities.mockResolvedValue(1n)
    mocks.serializeCapabilities.mockReturnValue('1')
    mocks.recordAdminLogin.mockResolvedValue(undefined)

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/callback?code=CODE&state=STATE',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://menhera.example.test/api/auth/finish?token=hop-token',
    )
    expect(mocks.recordAdminLogin).not.toHaveBeenCalled()
    expect(mocks.after).toHaveBeenCalledTimes(1)

    await runDeferredTask()

    expect(mocks.recordAdminLogin).toHaveBeenCalledWith('guild-1')
  })

  it('falls back to the origin tenant when Discord guild listing misses the tenant', async () => {
    mocks.verifyOAuthState.mockResolvedValue({
      nonce: 'flow-1',
      originHost: 'menhera.albion-guildmanager.com',
      returnTo: '/',
      invite: null,
      preferredLocale: 'en',
    })
    mocks.listUserGuilds.mockResolvedValue([])
    mocks.resolveTenantBySlug.mockResolvedValue({
      tenantId: 'guild-1',
      slug: 'menhera',
      name: 'Menhera',
      discordGuildId: 'discord-guild-1',
    })
    mocks.getGuildMemberByBot.mockResolvedValue({ user: null, roles: [], nick: null })
    mocks.identityFromMember.mockReturnValue(null)
    mocks.getAppSetting.mockResolvedValue('[]')
    mocks.resolveTenantLoginAccess.mockReturnValue({ isMember: false, isAdmin: false })
    mocks.mapDiscordLocale.mockReturnValue('en')
    mocks.serializeCapabilities.mockReturnValue('0')

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/callback?code=CODE&state=STATE',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://menhera.example.test/api/auth/finish?token=hop-token',
    )
    expect(mocks.getTenantDiscordConfig).toHaveBeenCalledWith('guild-1')
    expect(mocks.getGuildMemberByBot).toHaveBeenCalledWith('discord-guild-1', 'guest-1')
    expect(mocks.signHopToken).toHaveBeenCalledWith({
      session: expect.objectContaining({
        discordId: 'guest-1',
        isMember: false,
        isGuest: false,
        isAllianceCandidate: true,
        guildId: 'guild-1',
      }),
      returnTo: '/',
      preferredLocale: 'en',
      flowId: 'flow-1',
      requiresBrowserBinding: true,
    })
  })

  it('rejects an origin-tenant regular event login when the user is not a Discord member', async () => {
    mocks.verifyOAuthState.mockResolvedValue({
      nonce: 'flow-1',
      originHost: 'menhera.albion-guildmanager.com',
      returnTo: '/events/event-1',
      invite: null,
      preferredLocale: 'en',
    })
    mocks.listUserGuilds.mockResolvedValue([])
    mocks.resolveTenantBySlug.mockResolvedValue({
      tenantId: 'guild-1',
      slug: 'menhera',
      name: 'Menhera',
      discordGuildId: 'discord-guild-1',
    })
    mocks.getGuildMemberByBot.mockResolvedValue(null)

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/callback?code=CODE&state=STATE',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://menhera.albion-guildmanager.com/login?returnTo=%2Fevents%2Fevent-1&auth_error=not_in_guild',
    )
    expect(mocks.getGuildMemberByBot).toHaveBeenCalledWith('discord-guild-1', 'guest-1')
    expect(mocks.signHopToken).not.toHaveBeenCalled()
    expect(mocks.recordAuthFailure).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'callback',
      'not_in_guild',
      expect.objectContaining({
        origin_tenant_fallback: 'guild-1',
      }),
    )
  })

  it('redacts invite tokens in the unhandled callback error log', async () => {
    mocks.verifyOAuthState.mockResolvedValue({
      nonce: 'flow-1',
      originHost: 'menhera.albion-guildmanager.com',
      returnTo: '/events/event-1?invite=guest-token',
      invite: 'guest-token',
      preferredLocale: 'en',
    })
    mocks.exchangeCode.mockRejectedValue(new Error('discord down'))

    await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/callback?code=CODE&state=STATE',
      ),
    )

    expect(mocks.logError).toHaveBeenCalledWith(
      '[discord-callback] unhandled',
      expect.any(Error),
      expect.objectContaining({
        return_to: '/events/event-1?invite=%5Bredacted%5D',
      }),
    )
    expect(JSON.stringify(mocks.logError.mock.calls)).not.toContain('guest-token')
  })

  it('rejects a valid signed state that was not started in this browser', async () => {
    mocks.verifyOAuthState.mockResolvedValue({
      nonce: 'flow-1',
      originHost: 'menhera.albion-guildmanager.com',
      returnTo: '/members',
      invite: null,
      preferredLocale: 'en',
    })
    mocks.hasOAuthStateBindingCookie.mockReturnValue(false)

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/callback?code=CODE&state=STATE',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://menhera.albion-guildmanager.com/login?returnTo=%2Fmembers&auth_error=state_browser_mismatch',
    )
    expect(mocks.exchangeCode).not.toHaveBeenCalled()
  })

  it('uses the tenant named by a root-domain public guild link before unrelated matches', async () => {
    const targetTenant = {
      id: 'guild-target',
      discordGuildId: 'discord-target',
      slug: 'target',
      name: 'Target Guild',
      createdByDiscordId: null,
      memberRoleIds: [],
      adminRoleIds: [],
      eventChannelId: null,
      botInstalled: true,
    }
    mocks.verifyOAuthState.mockResolvedValue({
      nonce: 'flow-1',
      originHost: 'albion-guildmanager.com',
      returnTo: '/g/target',
      invite: null,
      preferredLocale: 'en',
    })
    mocks.resolveAuthTargetTenant.mockResolvedValue(targetTenant)
    mocks.listUserGuilds.mockResolvedValue([
      {
        id: 'discord-unrelated',
        name: 'Unrelated',
        icon: null,
        owner: false,
        permissions: '0',
      },
    ])
    mocks.getTenantDiscordConfigsByDiscordGuildIds.mockResolvedValue(new Map([
      [
        'discord-unrelated',
        {
          ...targetTenant,
          id: 'guild-unrelated',
          discordGuildId: 'discord-unrelated',
          slug: 'unrelated',
        },
      ],
    ]))
    mocks.getGuildMemberByBot.mockResolvedValue(null)

    await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/callback?code=CODE&state=STATE',
      ),
    )

    expect(mocks.getGuildMemberByBot).toHaveBeenCalledWith('discord-target', 'guest-1')
  })
})
