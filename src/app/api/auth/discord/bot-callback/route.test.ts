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
  recordAuthSuccess: mocks.recordAuthSuccess,
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
    })
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
  })

  it('redacts OAuth query values before logging invalid guild ids', async () => {
    const response = await GET(
      new NextRequest(
        'https://example.test/api/auth/discord/bot-callback?guild_id=bad&code=oauth-code&state=signed-state&permissions=8',
      ),
    )

    expect(response.headers.get('location')).toBe('https://example.test/onboard?install_error=guild_id_missing')
    expect(mocks.logError).toHaveBeenCalledWith(
      '[bot-callback] invalid guild_id',
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
      'https://albion-guildmanager.com/api/auth/discord/bot-callback?guild_id=123456789012345678&code=oauth-code',
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
})
