import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
  signSession: vi.fn(),
  cookieOptions: vi.fn(),
  serializeCapabilities: vi.fn(),
  getDiscordGuild: vi.fn(),
  exchangeBotInstallCode: vi.fn(),
  getCurrentUser: vi.fn(),
  getAdminClient: vi.fn(),
  isValidTenantSlug: vi.fn(),
  upsertGuildAvatar: vi.fn(),
  recordAdminLogin: vi.fn(),
  lastGuildCookieOptions: vi.fn(),
  recordAuthSuccess: vi.fn(),
  captureTenantAcquisitionSource: vi.fn(),
  logTenantOnboardingEvent: vi.fn(),
  revalidateTenantDirectoryCache: vi.fn(),
  verifyBotInstallState: vi.fn(),
  resolveBotInstallIntent: vi.fn(),
  botInstallIntentCookieName: vi.fn(),
  expiredBotInstallIntentCookieOptions: vi.fn(),
  getBotInstallIntentCookieValues: vi.fn(),
  recordAuthFailure: vi.fn(),
  signHopToken: vi.fn(),
  buildTenantHostUrl: vi.fn(),
  classifyHost: vi.fn(),
  getCanonicalRootDomain: vi.fn(),
  canShareAuthBindingCookie: vi.fn(),
  hopTokenBindingCookieName: vi.fn(),
  hopTokenBindingCookieOptions: vi.fn(),
}))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return {
    ...actual,
    after: mocks.after,
  }
})

vi.mock('@/lib/log', () => ({
  log: {
    error: mocks.logError,
    warn: mocks.logWarn,
    info: mocks.logInfo,
  },
}))

vi.mock('@/lib/session', () => ({
  SESSION_COOKIE_NAME: 'user_session',
  cookieOptions: mocks.cookieOptions,
  signSession: mocks.signSession,
}))

vi.mock('@/lib/permissions', () => ({
  ALL_CAPABILITIES: ['all'],
  serializeCapabilities: mocks.serializeCapabilities,
}))

vi.mock('@/lib/discord', () => ({
  getDiscordGuild: mocks.getDiscordGuild,
  exchangeBotInstallCode: mocks.exchangeBotInstallCode,
  getCurrentUser: mocks.getCurrentUser,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/tenant-resolver', () => ({
  isValidTenantSlug: mocks.isValidTenantSlug,
  buildTenantHostUrl: mocks.buildTenantHostUrl,
  classifyHost: mocks.classifyHost,
  getCanonicalRootDomain: mocks.getCanonicalRootDomain,
}))

vi.mock('@/lib/tenant-cache', () => ({
  revalidateTenantDirectoryCache: mocks.revalidateTenantDirectoryCache,
}))

vi.mock('@/lib/discord-avatar', () => ({
  upsertGuildAvatar: mocks.upsertGuildAvatar,
}))

vi.mock('@/lib/tenant-activity', () => ({
  recordAdminLogin: mocks.recordAdminLogin,
}))

vi.mock('@/lib/last-guild-cookie', () => ({
  LAST_GUILD_COOKIE: 'last_guild',
  lastGuildCookieOptions: mocks.lastGuildCookieOptions,
}))

vi.mock('@/lib/auth-telemetry', () => ({
  createAuthTimer: () => () => 0,
  recordAuthFailure: mocks.recordAuthFailure,
  recordAuthSuccess: mocks.recordAuthSuccess,
}))

vi.mock('@/lib/oauth-state', () => ({
  verifyBotInstallState: mocks.verifyBotInstallState,
  resolveBotInstallIntent: mocks.resolveBotInstallIntent,
  signHopToken: mocks.signHopToken,
}))

vi.mock('@/lib/auth-flow-cookie', () => ({
  AUTH_FLOW_BINDING_COOKIE_VALUE: '1',
  botInstallIntentCookieName: mocks.botInstallIntentCookieName,
  canShareAuthBindingCookie: mocks.canShareAuthBindingCookie,
  expiredBotInstallIntentCookieOptions: mocks.expiredBotInstallIntentCookieOptions,
  getBotInstallIntentCookieValues: mocks.getBotInstallIntentCookieValues,
  hopTokenBindingCookieName: mocks.hopTokenBindingCookieName,
  hopTokenBindingCookieOptions: mocks.hopTokenBindingCookieOptions,
}))

vi.mock('@/lib/seo-attribution', () => ({
  SEO_SESSION_COOKIE: 'agm_seo_session',
  captureTenantAcquisitionSource: mocks.captureTenantAcquisitionSource,
}))

vi.mock('@/lib/tenant-onboarding-events', () => ({
  logTenantOnboardingEvent: mocks.logTenantOnboardingEvent,
}))

import { GET } from './route'

function createExistingTenantDbMock() {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: 'tenant-1',
      slug: 'guild-slug',
      created_by_discord_id: 'installer-1',
    },
  })
  const eqForSelect = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq: eqForSelect }))
  const eqForUpdate = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn(() => ({ eq: eqForUpdate }))
  const from = vi.fn(() => ({ select, update }))
  return { from, select, update, eqForUpdate, maybeSingle }
}

function createTenantLookupErrorDbMock() {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: null,
    error: { message: 'lookup failed' },
  })
  const eqForSelect = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq: eqForSelect }))
  const insert = vi.fn()
  const from = vi.fn(() => ({ select, insert }))
  return { from, insert }
}

function createExistingTenantUpdateErrorDbMock() {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: 'tenant-1',
      slug: 'guild-slug',
      created_by_discord_id: 'installer-1',
    },
    error: null,
  })
  const eqForSelect = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq: eqForSelect }))
  const eqForUpdate = vi.fn().mockResolvedValue({
    error: { message: 'update failed' },
  })
  const update = vi.fn(() => ({ eq: eqForUpdate }))
  const from = vi.fn(() => ({ select, update }))
  return { from }
}

function createOwnerlessTenantDbMock() {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: {
      id: 'tenant-1',
      slug: 'guild-slug',
      created_by_discord_id: null,
    },
    error: null,
  })
  const eqForSelect = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq: eqForSelect }))
  const eqForUpdate = vi.fn().mockResolvedValue({ error: null })
  const update = vi.fn(() => ({ eq: eqForUpdate }))
  const from = vi.fn(() => ({ select, update }))
  return { from, update }
}

async function runDeferredTask(index = 0): Promise<void> {
  const task = mocks.after.mock.calls[index]?.[0] as (() => Promise<void> | void) | undefined
  expect(task).toBeDefined()
  await task?.()
}

describe('GET /api/auth/discord/bot-callback', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()

    mocks.after.mockImplementation(() => undefined)
    mocks.signSession.mockResolvedValue('signed-session')
    mocks.cookieOptions.mockReturnValue({ path: '/', httpOnly: true })
    mocks.serializeCapabilities.mockReturnValue('all-capabilities')
    mocks.getDiscordGuild.mockResolvedValue({
      id: '123456789012345678',
      name: 'Guild Name',
      icon: null,
    })
    mocks.exchangeBotInstallCode.mockResolvedValue({
      access_token: 'discord-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'identify',
      guild: {
        id: '123456789012345678',
        name: 'Guild Name',
        icon: null,
      },
    })
    mocks.verifyBotInstallState.mockResolvedValue({
      nonce: 'flow-1',
      expectedGuildId: '123456789012345678',
      mode: 'guided',
      issuedAt: Date.now(),
    })
    mocks.resolveBotInstallIntent.mockResolvedValue({
      token: 'SIGNED_STATE',
      state: {
        nonce: 'flow-1',
        expectedGuildId: '123456789012345678',
        mode: 'guided',
        issuedAt: Date.now(),
      },
    })
    mocks.botInstallIntentCookieName.mockImplementation(
      (flowId: string) => `agm_bot_install_${flowId}`,
    )
    mocks.expiredBotInstallIntentCookieOptions.mockReturnValue({
      path: '/',
      httpOnly: true,
      maxAge: 0,
    })
    mocks.getBotInstallIntentCookieValues.mockReturnValue(['SIGNED_STATE'])
    mocks.getCurrentUser.mockResolvedValue({
      id: 'installer-1',
      username: 'installer',
      global_name: 'Installer',
      avatar: 'avatar-hash',
    })
    mocks.getAdminClient.mockReturnValue(createExistingTenantDbMock())
    mocks.isValidTenantSlug.mockReturnValue(true)
    mocks.upsertGuildAvatar.mockResolvedValue(undefined)
    mocks.recordAdminLogin.mockResolvedValue(undefined)
    mocks.lastGuildCookieOptions.mockReturnValue({ path: '/', httpOnly: true })
    mocks.captureTenantAcquisitionSource.mockResolvedValue({ ok: true })
    mocks.logTenantOnboardingEvent.mockResolvedValue({ ok: true })
    mocks.signHopToken.mockResolvedValue('hop-token')
    mocks.buildTenantHostUrl.mockImplementation(
      (slug: string, path: string) => `https://${slug}.albion-guildmanager.com${path}`,
    )
    mocks.classifyHost.mockImplementation((host: string) => {
      if (host === 'albion-guildmanager.com') return { kind: 'root' }
      if (host === 'localhost' || host.startsWith('localhost:')) return { kind: 'localhost' }
      if (host.endsWith('.albion-guildmanager.com')) {
        return { kind: 'tenant', slug: host.split('.')[0] }
      }
      return { kind: 'legacy' }
    })
    mocks.getCanonicalRootDomain.mockReturnValue('albion-guildmanager.com')
    mocks.canShareAuthBindingCookie.mockReturnValue(true)
    mocks.hopTokenBindingCookieName.mockImplementation(
      (flowId: string) => `agm_auth_hop_${flowId}`,
    )
    mocks.hopTokenBindingCookieOptions.mockReturnValue({ path: '/', httpOnly: true })
  })

  it('redacts OAuth query values before logging an invalid guild hint', async () => {
    const response = await GET(
      new NextRequest(
        'https://example.test/api/auth/discord/bot-callback?guild_id=bad&code=oauth-code&state=signed-state&permissions=8',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://example.test/onboard?install_error=guild_mismatch',
    )
    expect(mocks.logError).toHaveBeenCalledWith(
      '[bot-callback] guild binding mismatch',
      undefined,
      expect.objectContaining({
        params: expect.stringContaining('permissions=8'),
      }),
    )
    const params = mocks.logError.mock.calls[0]?.[2]?.params as string
    expect(params).not.toContain('oauth-code')
    expect(params).not.toContain('signed-state')
    expect(new URLSearchParams(params).get('code')).toBe('[redacted]')
    expect(new URLSearchParams(params).get('state')).toBe('[redacted]')
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it('redacts state when logging missing code diagnostics', async () => {
    await GET(
      new NextRequest(
        'https://example.test/api/auth/discord/bot-callback?guild_id=123456789012345678&state=signed-state&permissions=8',
      ),
    )

    expect(mocks.logError).toHaveBeenCalledWith(
      '[bot-callback] missing code',
      undefined,
      expect.objectContaining({
        params: expect.not.stringContaining('signed-state'),
      }),
    )
    expect(mocks.after).not.toHaveBeenCalled()
  })

  it('redirects after required install setup and defers telemetry work', async () => {
    const request = new NextRequest(
      'https://albion-guildmanager.com/api/auth/discord/bot-callback?guild_id=123456789012345678&code=oauth-code&state=STATE',
      {
        headers: {
          cookie: 'agm_seo_session=11111111-1111-4111-8111-111111111111',
          host: 'albion-guildmanager.com',
        },
      },
    )

    const response = await GET(request)

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/onboard/setup/tenant-1',
    )
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(mocks.exchangeBotInstallCode).toHaveBeenCalledWith('oauth-code')
    expect(mocks.getCurrentUser).toHaveBeenCalledWith('discord-access-token')
    expect(mocks.getDiscordGuild).toHaveBeenCalledWith('123456789012345678')
    expect(mocks.upsertGuildAvatar).toHaveBeenCalledWith(
      'tenant-1',
      'installer-1',
      'Installer',
      'avatar-hash',
      true,
      false,
    )
    expect(mocks.signSession).toHaveBeenCalledWith(
      expect.objectContaining({
        discordId: 'installer-1',
        guildId: 'tenant-1',
        isAdmin: true,
        capabilities: 'all-capabilities',
      }),
    )
    expect(mocks.recordAuthSuccess).toHaveBeenCalledWith(
      request,
      'bot_callback',
      expect.objectContaining({
        tenant_id: 'tenant-1',
        discord_guild_id: '123456789012345678',
        created_tenant: false,
        duration_ms: 0,
      }),
    )

    expect(mocks.recordAdminLogin).not.toHaveBeenCalled()
    expect(mocks.logTenantOnboardingEvent).not.toHaveBeenCalled()
    expect(mocks.captureTenantAcquisitionSource).not.toHaveBeenCalled()
    expect(mocks.after).toHaveBeenCalledTimes(1)

    await runDeferredTask()

    expect(mocks.recordAdminLogin).toHaveBeenCalledWith('tenant-1')
    expect(mocks.logTenantOnboardingEvent).toHaveBeenCalledWith({
      guildId: 'tenant-1',
      actorDiscordId: 'installer-1',
      eventType: 'bot_installed',
      details: {
        discordGuildId: '123456789012345678',
        guildName: 'Guild Name',
        createdTenant: false,
      },
    })
    expect(mocks.captureTenantAcquisitionSource).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      visitorId: '11111111-1111-4111-8111-111111111111',
    })
  })

  it('fails closed when the existing tenant lookup fails', async () => {
    const db = createTenantLookupErrorDbMock()
    mocks.getAdminClient.mockReturnValue(db)

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/bot-callback?guild_id=123456789012345678&code=oauth-code&state=STATE',
        { headers: { host: 'albion-guildmanager.com' } },
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/onboard?install_error=server_error',
    )
    expect(db.insert).not.toHaveBeenCalled()
    expect(mocks.signSession).not.toHaveBeenCalled()
  })

  it('fails closed when an existing tenant cannot be updated', async () => {
    mocks.getAdminClient.mockReturnValue(createExistingTenantUpdateErrorDbMock())

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/bot-callback?guild_id=123456789012345678&code=oauth-code&state=STATE',
        { headers: { host: 'albion-guildmanager.com' } },
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/onboard?install_error=server_error',
    )
    expect(mocks.signSession).not.toHaveBeenCalled()
    expect(mocks.recordAuthSuccess).not.toHaveBeenCalled()
  })

  it('persists the installer as owner when a legacy tenant has no owner', async () => {
    const db = createOwnerlessTenantDbMock()
    mocks.getAdminClient.mockReturnValue(db)

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/bot-callback?guild_id=123456789012345678&code=oauth-code&state=STATE',
        { headers: { host: 'albion-guildmanager.com' } },
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/onboard/setup/tenant-1',
    )
    expect(db.update).toHaveBeenCalledWith(expect.objectContaining({
      created_by_discord_id: 'installer-1',
    }))
    expect(mocks.signSession).toHaveBeenCalled()
  })

  it('recovers the signed browser intent when Discord omits state', async () => {
    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/bot-callback?guild_id=123456789012345678&code=oauth-code',
        {
          headers: {
            cookie: 'agm_bot_install_flow-1=SIGNED_STATE',
            host: 'albion-guildmanager.com',
          },
        },
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/onboard/setup/tenant-1',
    )
    expect(mocks.exchangeBotInstallCode).toHaveBeenCalledWith('oauth-code')
    expect(mocks.resolveBotInstallIntent).toHaveBeenCalledWith(
      ['SIGNED_STATE'],
      {
        returnedState: null,
        guildId: '123456789012345678',
      },
    )
    expect(mocks.getAdminClient).toHaveBeenCalled()
  })

  it('rejects a state-less callback when this browser has no install intent', async () => {
    mocks.resolveBotInstallIntent.mockResolvedValue(null)

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/bot-callback?guild_id=123456789012345678&code=oauth-code',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/onboard?install_error=state_mismatch',
    )
    expect(mocks.exchangeBotInstallCode).toHaveBeenCalledWith('oauth-code')
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it('rejects a query guild hint that differs from Discord token response guild', async () => {
    mocks.exchangeBotInstallCode.mockResolvedValue({
      access_token: 'discord-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'identify',
      guild: {
        id: '999999999999999999',
        name: 'Different Guild',
        icon: null,
      },
    })

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/bot-callback?guild_id=123456789012345678&code=oauth-code&state=STATE',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/onboard?install_error=guild_mismatch',
    )
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
    expect(mocks.getDiscordGuild).not.toHaveBeenCalled()
  })

  it('rejects an install code whose authoritative guild differs from signed intent', async () => {
    mocks.verifyBotInstallState.mockResolvedValue({
      nonce: 'flow-1',
      expectedGuildId: '999999999999999999',
      mode: 'guided',
      issuedAt: Date.now(),
    })
    mocks.resolveBotInstallIntent.mockResolvedValue({
      token: 'SIGNED_STATE',
      state: {
        nonce: 'flow-1',
        expectedGuildId: '999999999999999999',
        mode: 'guided',
        issuedAt: Date.now(),
      },
    })

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/bot-callback?guild_id=123456789012345678&code=oauth-code&state=STATE',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/onboard?install_error=guild_mismatch',
    )
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it('rejects code grants that omit Discord authoritative guild data', async () => {
    mocks.exchangeBotInstallCode.mockResolvedValue({
      access_token: 'discord-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'identify',
    })

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/bot-callback?guild_id=123456789012345678&code=oauth-code&state=STATE',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/onboard?install_error=guild_id_missing',
    )
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it('rejects a valid signed install state that is not bound to this browser', async () => {
    mocks.resolveBotInstallIntent.mockResolvedValue(null)

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.com/api/auth/discord/bot-callback?guild_id=123456789012345678&code=oauth-code&state=STATE',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/onboard?install_error=state_mismatch',
    )
    expect(mocks.exchangeBotInstallCode).not.toHaveBeenCalled()
  })

  it('keeps an unbound verified open install on the public recovery screen', async () => {
    mocks.verifyBotInstallState.mockResolvedValue({
      nonce: 'open-flow',
      expectedGuildId: null,
      mode: 'open',
      originHost: 'albion-guildmanager.com',
      issuedAt: Date.now(),
    })
    mocks.resolveBotInstallIntent.mockResolvedValue(null)

    const response = await GET(
      new NextRequest(
        'https://albion-guildmanager.vercel.app/api/auth/discord/bot-callback?code=oauth-code&state=OPEN_STATE',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/invite/open?install_error=state_mismatch',
    )
    expect(mocks.exchangeBotInstallCode).not.toHaveBeenCalled()
  })

  it('hands a successful install to the tenant when callback cookies cannot cross hosts', async () => {
    mocks.canShareAuthBindingCookie.mockReturnValue(false)

    const request = new NextRequest(
      'https://albion-guildmanager.vercel.app/api/auth/discord/bot-callback?guild_id=123456789012345678&code=oauth-code&state=STATE',
      { headers: { host: 'albion-guildmanager.vercel.app' } },
    )
    const response = await GET(request)

    expect(mocks.signHopToken).toHaveBeenCalledWith({
      session: expect.objectContaining({
        discordId: 'installer-1',
        guildId: 'tenant-1',
        isAdmin: true,
      }),
      returnTo: '/onboard/setup/tenant-1',
      preferredLocale: null,
      flowId: 'flow-1',
      requiresBrowserBinding: false,
    })
    expect(response.headers.get('location')).toBe(
      'https://guild-slug.albion-guildmanager.com/api/auth/finish?token=hop-token',
    )
    expect(mocks.signSession).not.toHaveBeenCalled()
  })
})
