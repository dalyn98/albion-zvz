import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  getSession: vi.fn(),
  fetchDiscordGuildRoles: vi.fn(),
  fetchDiscordGuildChannels: vi.fn(),
  logTenantOnboardingEvent: vi.fn(),
  invalidateAppSettingsCache: vi.fn(),
  invalidateTenantDirectoryCache: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
  signSession: vi.fn(),
  SESSION_COOKIE_NAME: 'user_session',
  cookieOptions: vi.fn(() => ({})),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock('@/lib/discord-guild-resources', () => ({
  fetchDiscordGuildRoles: mocks.fetchDiscordGuildRoles,
  fetchDiscordGuildChannels: mocks.fetchDiscordGuildChannels,
}))

vi.mock('@/lib/tenant-onboarding-events', () => ({
  logTenantOnboardingEvent: mocks.logTenantOnboardingEvent,
}))

vi.mock('@/lib/app-settings-invalidation', () => ({
  invalidateAppSettingsCache: mocks.invalidateAppSettingsCache,
}))

vi.mock('@/lib/tenant-cache', () => ({
  invalidateTenantDirectoryCache: mocks.invalidateTenantDirectoryCache,
}))

vi.mock('@/lib/oauth-state', () => ({
  signHopToken: vi.fn(),
}))

import { saveTenantAlbion, saveTenantSetup } from './onboard'

function createTenantQuery() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: {
        id: 'tenant-1',
        discord_guild_id: 'discord-guild-1',
        created_by_discord_id: 'admin-1',
      },
    })),
  }
  return query
}

describe('saveTenantAlbion', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
    mocks.getSession.mockReset()
  })

  it('requires a selected Albion home guild during first setup', async () => {
    const tenantQuery = createTenantQuery()
    const from = vi.fn((table: string) => {
      if (table === 'tenants') return tenantQuery
      throw new Error(`unexpected table: ${table}`)
    })
    mocks.getAdminClient.mockReturnValue({ from })
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })

    await expect(
      saveTenantAlbion({
        tenantId: 'tenant-1',
        server: 'west',
        homeGuildId: '',
        homeGuildName: '',
      }),
    ).resolves.toEqual({ error: 'homeGuildRequired' })
    expect(from).toHaveBeenCalledTimes(1)
  })
})

describe('saveTenantSetup', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
    mocks.getSession.mockReset()
    mocks.fetchDiscordGuildRoles.mockReset()
    mocks.fetchDiscordGuildChannels.mockReset()
    mocks.logTenantOnboardingEvent.mockReset()
    mocks.invalidateAppSettingsCache.mockReset()
    mocks.invalidateTenantDirectoryCache.mockReset()
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.fetchDiscordGuildRoles.mockResolvedValue([
      {
        id: '123456789012345678',
        name: 'Member',
        color: 0,
        position: 1,
        managed: false,
      },
      {
        id: '987654321098765432',
        name: 'Admin',
        color: 0,
        position: 2,
        managed: false,
      },
    ])
    mocks.fetchDiscordGuildChannels.mockResolvedValue([
      {
        id: '111111111111111111',
        name: 'events',
        type: 0,
        position: 1,
        parent_id: null,
      },
    ])
  })

  it('rejects malformed Discord role and channel IDs before writing setup settings', async () => {
    await expect(
      saveTenantSetup({
        tenantId: 'tenant-1',
        memberRoleIds: ['not-a-role-id'],
        adminRoleIds: ['123456789012345678'],
        eventChannelId: '987654321098765432',
        timezone: 'Asia/Seoul',
      }),
    ).resolves.toEqual({ error: 'errorGeneric' })

    await expect(
      saveTenantSetup({
        tenantId: 'tenant-1',
        memberRoleIds: ['123456789012345678'],
        adminRoleIds: ['987654321098765432'],
        eventChannelId: 'not-a-channel-id',
        timezone: 'Asia/Seoul',
      }),
    ).resolves.toEqual({ error: 'errorGeneric' })

    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it('requires an event announcement channel before writing setup settings', async () => {
    await expect(
      saveTenantSetup({
        tenantId: 'tenant-1',
        memberRoleIds: ['123456789012345678'],
        adminRoleIds: ['987654321098765432'],
        eventChannelId: '',
        timezone: 'Asia/Seoul',
      }),
    ).resolves.toEqual({ error: 'missingEventChannel' })

    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it('rejects a well-formed channel id that is not in the installed Discord guild', async () => {
    const tenantQuery = createTenantQuery()
    const from = vi.fn((table: string) => {
      if (table === 'tenants') return tenantQuery
      throw new Error(`unexpected table: ${table}`)
    })
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(
      saveTenantSetup({
        tenantId: 'tenant-1',
        memberRoleIds: ['123456789012345678'],
        adminRoleIds: ['987654321098765432'],
        eventChannelId: '222222222222222222',
        timezone: 'Asia/Seoul',
      }),
    ).resolves.toEqual({ error: 'errorGeneric' })

    expect(mocks.fetchDiscordGuildChannels).toHaveBeenCalledWith(
      'discord-guild-1',
    )
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('persists verified roles and the required guild channel', async () => {
    const tenantQuery = createTenantQuery()
    const updateEq = vi.fn(async () => ({ error: null }))
    const update = vi.fn(() => ({ eq: updateEq }))
    const tenantTable = { ...tenantQuery, update }
    const upsert = vi.fn(async () => ({ error: null }))
    const from = vi.fn((table: string) => {
      if (table === 'tenants') return tenantTable
      if (table === 'app_settings') return { upsert }
      throw new Error(`unexpected table: ${table}`)
    })
    const rpc = vi.fn(async () => ({ error: null }))
    mocks.getAdminClient.mockReturnValue({ from, rpc })

    await expect(
      saveTenantSetup({
        tenantId: 'tenant-1',
        memberRoleIds: ['123456789012345678'],
        adminRoleIds: ['987654321098765432'],
        eventChannelId: '111111111111111111',
        timezone: 'Asia/Seoul',
      }),
    ).resolves.toEqual({})

    expect(update).toHaveBeenCalledWith({
      member_role_ids: ['123456789012345678'],
      event_channel_id: '111111111111111111',
    })
    expect(updateEq).toHaveBeenCalledWith('id', 'tenant-1')
    expect(rpc).toHaveBeenCalledWith(
      'replace_onboarding_permission_admin_roles',
      {
        p_guild_id: 'tenant-1',
        p_roles: [{ id: '987654321098765432', name: 'Admin' }],
        p_actor_discord_id: 'admin-1',
      },
    )
    expect(upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          guild_id: 'tenant-1',
          key: 'tenant_timezone',
          value: 'Asia/Seoul',
        }),
      ],
      { onConflict: 'guild_id,key' },
    )
    expect(mocks.logTenantOnboardingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'tenant-1',
        actorDiscordId: 'admin-1',
        eventType: 'setup_step_saved',
      }),
    )
  })
})
