import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
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
  getTenantDiscordConfigByDiscordGuildId: vi.fn(),
  recordAdminLogin: vi.fn(),
  signHopToken: vi.fn(),
  signOAuthState: vi.fn(),
  verifyOAuthState: vi.fn(),
  buildTenantHostUrl: vi.fn(),
  classifyHost: vi.fn(),
  resolveTenantBySlug: vi.fn(),
  recordAuthFailure: vi.fn(),
}))

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
  getTenantDiscordConfigByDiscordGuildId: mocks.getTenantDiscordConfigByDiscordGuildId,
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

vi.mock('@/lib/tenant-resolver', () => ({
  buildTenantHostUrl: mocks.buildTenantHostUrl,
  classifyHost: mocks.classifyHost,
  resolveTenantBySlug: mocks.resolveTenantBySlug,
  FALLBACK_TENANT_SLUG: 'menhera',
}))

vi.mock('@/lib/auth-telemetry', () => ({
  recordAuthFailure: mocks.recordAuthFailure,
}))

vi.mock('@/lib/log', () => ({
  log: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}))

import { GET } from './route'

function createDb() {
  return {
    from(table: string) {
      const chain = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => {
          if (table === 'events') {
            return { data: { guild_id: 'guild-1', status: 'published' }, error: null }
          }
          if (table === 'guests') {
            return { data: null, error: null }
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
    mocks.getTenantDiscordConfigByDiscordGuildId.mockResolvedValue(null)
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
    mocks.buildTenantHostUrl.mockImplementation(
      (slug: string, path: string) => `https://${slug}.example.test${path}`,
    )
    mocks.classifyHost.mockReturnValue({ kind: 'tenant', slug: 'menhera' })
    mocks.resolveTenantBySlug.mockResolvedValue(null)
    mocks.signSession.mockResolvedValue('session-cookie')
    mocks.cookieOptions.mockReturnValue({ path: '/', httpOnly: true })
  })

  it('turns a public event login into an event-scoped guest instead of onboarding', async () => {
    mocks.verifyOAuthState.mockResolvedValue({
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
      'https://menhera.example.test/api/auth/finish?token=hop-token',
    )
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
    })
    expect(mocks.signSession).not.toHaveBeenCalled()
  })

  it('keeps OAuth errors on the original event URL when signed state is valid', async () => {
    mocks.verifyOAuthState.mockResolvedValue({
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
      'https://menhera.albion-guildmanager.com/events/event-1?invite=guest-token&auth_error=denied',
    )
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
    mocks.getTenantDiscordConfigByDiscordGuildId.mockResolvedValue({
      id: 'guild-1',
      discordGuildId: 'discord-guild-1',
      slug: 'menhera',
      name: 'Menhera',
      createdByDiscordId: null,
      memberRoleIds: ['member-role'],
      adminRoleIds: [],
      eventChannelId: null,
      botInstalled: true,
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
    })
    expect(mocks.upsertGuildAvatar).not.toHaveBeenCalled()
  })

  it('falls back to the origin tenant when Discord guild listing misses the tenant', async () => {
    mocks.verifyOAuthState.mockResolvedValue({
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
    })
  })

  it('keeps an origin-tenant event login on the guest path when the user is not a Discord member', async () => {
    mocks.verifyOAuthState.mockResolvedValue({
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
      'https://menhera.example.test/api/auth/finish?token=hop-token',
    )
    expect(mocks.getGuildMemberByBot).toHaveBeenCalledWith('discord-guild-1', 'guest-1')
    expect(mocks.recordAuthFailure).not.toHaveBeenCalled()
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
    })
  })
})
