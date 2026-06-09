import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ALL_COMMAND_NAMES,
  COMMAND_AGM,
  handleSlashCommand,
} from './discord-commands'
import { MESSAGE_FLAG_EPHEMERAL } from './discord-interactions'
import type { DiscordInteractionPayload } from './discord-interactions'

const mocks = vi.hoisted(() => {
  const tenantMaybeSingle = vi.fn(async () => ({ data: null as unknown }))
  const tenantEqStatus = vi.fn(() => ({ maybeSingle: tenantMaybeSingle }))
  const tenantAnyMaybeSingle = vi.fn(async () => ({ data: null as unknown }))
  const tenantEqGuild = vi.fn(() => ({ eq: tenantEqStatus, maybeSingle: tenantAnyMaybeSingle }))
  const tenantSelect = vi.fn(() => ({ eq: tenantEqGuild }))
  const tenantInsertSingle = vi.fn(async () => ({
    data: { id: 'tenant-created', slug: 'setup-guild-abcd' } as unknown,
    error: null as unknown,
  }))
  const tenantInsertSelect = vi.fn(() => ({ single: tenantInsertSingle }))
  const tenantInsert = vi.fn(() => ({ select: tenantInsertSelect }))

  const overrideMaybeSingle = vi.fn(async () => ({ data: null as unknown }))
  const overrideEqDiscord = vi.fn(() => ({ maybeSingle: overrideMaybeSingle }))
  const overrideEqTenant = vi.fn(() => ({ eq: overrideEqDiscord }))
  const overrideSelect = vi.fn(() => ({ eq: overrideEqTenant }))

  const eventMaybeSingle = vi.fn(async () => ({ data: null as unknown }))
  const eventLimit = vi.fn(() => ({ maybeSingle: eventMaybeSingle }))
  const eventOrder = vi.fn(() => ({ limit: eventLimit }))
  const eventGte = vi.fn(() => ({ order: eventOrder }))
  const eventBattleStarted = vi.fn(() => ({ gte: eventGte }))
  const eventStatus = vi.fn(() => ({ is: eventBattleStarted }))
  const eventGuild = vi.fn(() => ({ eq: eventStatus }))
  const eventSelect = vi.fn(() => ({ eq: eventGuild }))

  const memberLanguageMaybeSingle = vi.fn(async () => ({ data: null as unknown }))
  const memberLanguageEqDiscord = vi.fn(() => ({ maybeSingle: memberLanguageMaybeSingle }))
  const memberLanguageEqGuild = vi.fn(() => ({ eq: memberLanguageEqDiscord }))

  const pointMemberMaybeSingle = vi.fn(async () => ({
    data: { discord_id: 'member-1', username: 'Member One' } as unknown,
  }))
  const pointMemberEqDiscord = vi.fn(() => ({ maybeSingle: pointMemberMaybeSingle }))
  const pointMemberEqGuild = vi.fn(() => ({ eq: pointMemberEqDiscord }))
  const guildAvatarSelect = vi.fn((columns?: string) => {
    if (columns === 'preferred_language') return { eq: memberLanguageEqGuild }
    return { eq: pointMemberEqGuild }
  })

  const guestLanguageMaybeSingle = vi.fn(async () => ({ data: null as unknown }))
  const guestLanguageEqDiscord = vi.fn(() => ({ maybeSingle: guestLanguageMaybeSingle }))
  const guestLanguageEqGuild = vi.fn(() => ({ eq: guestLanguageEqDiscord }))
  const guestLanguageSelect = vi.fn(() => ({ eq: guestLanguageEqGuild }))

  const pointLedgerInsert = vi.fn(async () => ({ error: null as unknown }))
  const adminAuditInsert = vi.fn(async () => ({ error: null as unknown }))
  const roleRewardsUpsert = vi.fn(async () => ({ error: null as unknown }))

  const from = vi.fn((table: string) => {
    if (table === 'tenants') return { select: tenantSelect, insert: tenantInsert }
    if (table === 'tenant_admin_overrides') return { select: overrideSelect }
    if (table === 'events') return { select: eventSelect }
    if (table === 'guild_avatars') return { select: guildAvatarSelect }
    if (table === 'guests') return { select: guestLanguageSelect }
    if (table === 'point_ledger') return { insert: pointLedgerInsert }
    if (table === 'admin_audit_log') return { insert: adminAuditInsert }
    if (table === 'role_rewards') return { upsert: roleRewardsUpsert }
    throw new Error(`Unexpected table: ${table}`)
  })

  const getDiscordGuild = vi.fn(async () => ({
    id: 'discord-guild-1',
    name: 'Setup Guild',
    icon: null,
  }))
  const sendDiscordChannelMessage = vi.fn(async () => 'quick-message-1')
  const logTenantOnboardingEvent = vi.fn(async () => {})

  return {
    adminAuditInsert,
    eventBattleStarted,
    eventGte,
    eventGuild,
    eventMaybeSingle,
    eventOrder,
    eventStatus,
    from,
    guestLanguageEqDiscord,
    guestLanguageEqGuild,
    guestLanguageMaybeSingle,
    guildAvatarSelect,
    memberLanguageEqDiscord,
    memberLanguageEqGuild,
    memberLanguageMaybeSingle,
    overrideEqDiscord,
    overrideEqTenant,
    overrideMaybeSingle,
    pointLedgerInsert,
    pointMemberEqDiscord,
    pointMemberEqGuild,
    pointMemberMaybeSingle,
    roleRewardsUpsert,
    tenantAnyMaybeSingle,
    tenantEqGuild,
    tenantEqStatus,
    tenantInsert,
    tenantInsertSelect,
    tenantInsertSingle,
    tenantMaybeSingle,
    getDiscordGuild,
    sendDiscordChannelMessage,
    logTenantOnboardingEvent,
  }
})

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({ from: mocks.from }),
}))

vi.mock('@/lib/discord', () => ({
  getDiscordGuild: mocks.getDiscordGuild,
  sendDiscordChannelMessage: mocks.sendDiscordChannelMessage,
}))

vi.mock('@/lib/tenant-onboarding-events', () => ({
  logTenantOnboardingEvent: mocks.logTenantOnboardingEvent,
}))

function agmPayload(subcommand: string, overrides: Partial<DiscordInteractionPayload> = {}) {
  return {
    id: 'interaction-1',
    type: 2,
    guild_id: 'discord-guild-1',
    data: {
      id: 'cmd-agm',
      name: COMMAND_AGM,
      type: 1,
      options: [{ name: subcommand, type: 1 }],
    },
    locale: 'ko',
    ...overrides,
  } as DiscordInteractionPayload
}

function agmPointsPayload(
  options: {
    targetDiscordId?: string
    delta?: number
    memo?: string
  } = {},
  overrides: Partial<DiscordInteractionPayload> = {},
) {
  return agmPayload(
    'points',
    {
      member: {
        nick: 'Admin Nick',
        user: { id: 'admin-1', username: 'admin' },
        roles: ['admin-role'],
      },
      data: {
        id: 'cmd-agm',
        name: COMMAND_AGM,
        type: 1,
        options: [
          {
            name: 'points',
            type: 1,
            options: [
              { name: 'member', type: 6, value: options.targetDiscordId ?? 'member-1' },
              { name: 'delta', type: 4, value: options.delta ?? 1000 },
              { name: 'memo', type: 3, value: options.memo ?? 'manual correction' },
            ],
          },
        ],
      },
      ...overrides,
    },
  )
}

function mockTenant(
  options: {
    createdByDiscordId?: string | null
    adminRoleIds?: string[]
    status?: string
    id?: string
    slug?: string
    name?: string
  } = {},
) {
  mocks.tenantMaybeSingle.mockResolvedValueOnce({
    data: {
      id: options.id ?? 'tenant-1',
      slug: options.slug ?? 'menhera',
      name: options.name ?? 'Menhera',
      status: options.status ?? 'active',
      created_by_discord_id: options.createdByDiscordId ?? 'owner-1',
      admin_role_ids: options.adminRoleIds ?? ['admin-role'],
    },
  })
}

function mockSetupTenant(
  options: {
    id?: string
    slug?: string
    name?: string
    status?: string
    createdByDiscordId?: string | null
    adminRoleIds?: string[]
  } = {},
) {
  mocks.tenantAnyMaybeSingle.mockResolvedValueOnce({
    data: {
      id: options.id ?? 'tenant-pending',
      slug: options.slug ?? 'setup-guild-abcd',
      name: options.name ?? 'Setup Guild',
      status: options.status ?? 'pending',
      created_by_discord_id: options.createdByDiscordId ?? 'installer-1',
      admin_role_ids: options.adminRoleIds ?? [],
    },
  })
}

describe('agm slash command navigation', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('registers only the agm command name in code', () => {
    expect(ALL_COMMAND_NAMES).toEqual([COMMAND_AGM])
  })

  it('does not keep the legacy direct wallet command as a valid command', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')

    const response = await handleSlashCommand({
      id: 'interaction-1',
      type: 2,
      guild_id: 'discord-guild-1',
      data: {
        id: 'cmd-wallet',
        name: 'wallet',
        type: 1,
      },
      locale: 'ko',
    } as DiscordInteractionPayload)

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('/agm')
    expect(mocks.from).toHaveBeenCalledWith('tenants')
  })

  it('defaults /agm command text to English when no site language is saved', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()

    const response = await handleSlashCommand(
      agmPayload('wallet', {
        locale: 'ko',
        member: {
          user: { id: 'member-1', username: 'member' },
          roles: [],
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('my wallet')
    expect(response.data?.content).not.toContain('내 지갑')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/me/wallet',
    )
    expect(mocks.memberLanguageEqGuild).toHaveBeenCalledWith('guild_id', 'tenant-1')
    expect(mocks.memberLanguageEqDiscord).toHaveBeenCalledWith('discord_id', 'member-1')
    expect(mocks.guestLanguageEqGuild).toHaveBeenCalledWith('guild_id', 'tenant-1')
    expect(mocks.guestLanguageEqDiscord).toHaveBeenCalledWith('discord_id', 'member-1')
  })

  it('uses the saved site language for /agm command text', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()
    mocks.memberLanguageMaybeSingle.mockResolvedValueOnce({
      data: { preferred_language: 'ko' },
    })

    const response = await handleSlashCommand(
      agmPayload('wallet', {
        locale: 'en-US',
        member: {
          user: { id: 'member-1', username: 'member' },
          roles: [],
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('내 지갑')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/me/wallet',
    )
    expect(mocks.guestLanguageMaybeSingle).not.toHaveBeenCalled()
  })

  it('routes /agm wallet to the tenant wallet entry point', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()

    const response = await handleSlashCommand(agmPayload('wallet'))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('my wallet')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/me/wallet',
    )
    expect(mocks.from).toHaveBeenCalledWith('tenants')
    expect(mocks.tenantEqGuild).toHaveBeenCalledWith('discord_guild_id', 'discord-guild-1')
    expect(mocks.tenantEqStatus).toHaveBeenCalledWith('status', 'active')
  })

  it('routes /agm setup to the admin dashboard when the guild page is already active', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()

    const response = await handleSlashCommand(
      agmPayload('setup', {
        member: {
          user: { id: 'member-1', username: 'member' },
          roles: [],
          permissions: '0',
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('guild page is already active')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/admin/dashboard',
    )
    expect(mocks.tenantInsert).not.toHaveBeenCalled()
  })

  it('lets the original installer resume a pending guild page from /agm setup', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockSetupTenant({
      id: 'tenant-pending',
      slug: 'setup-guild-abcd',
      createdByDiscordId: 'installer-1',
    })

    const response = await handleSlashCommand(
      agmPayload('setup', {
        member: {
          user: { id: 'installer-1', username: 'installer' },
          roles: [],
          permissions: '0',
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('guild page is being created')
    expect(response.data?.content).toContain(
      'https://albion-guildmanager.com/onboard/setup/tenant-pending',
    )
    expect(mocks.tenantInsert).not.toHaveBeenCalled()
  })

  it('does not hand a pending guild page to a different Discord server manager', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockSetupTenant({
      id: 'tenant-pending',
      slug: 'setup-guild-abcd',
      createdByDiscordId: 'installer-1',
    })

    const response = await handleSlashCommand(
      agmPayload('setup', {
        member: {
          user: { id: 'manager-2', username: 'manager' },
          roles: [],
          permissions: '32',
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('original installer')
    expect(response.data?.content).not.toContain('/onboard/setup/tenant-pending')
    expect(mocks.tenantInsert).not.toHaveBeenCalled()
  })

  it('blocks /agm setup for unlinked guilds when the caller cannot manage the Discord server', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')

    const response = await handleSlashCommand(
      agmPayload('setup', {
        member: {
          user: { id: 'member-1', username: 'member' },
          roles: [],
          permissions: '0',
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('Manage Server')
    expect(mocks.getDiscordGuild).not.toHaveBeenCalled()
    expect(mocks.tenantInsert).not.toHaveBeenCalled()
  })

  it('creates a pending guild page from /agm setup when a Discord server manager invokes it', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')

    const response = await handleSlashCommand(
      agmPayload('setup', {
        member: {
          user: { id: 'installer-1', username: 'installer' },
          roles: [],
          permissions: '32',
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('guild page has been reserved')
    expect(response.data?.content).toContain(
      'https://albion-guildmanager.com/onboard/setup/tenant-created',
    )
    expect(mocks.getDiscordGuild).toHaveBeenCalledWith('discord-guild-1')
    expect(mocks.tenantInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        discord_guild_id: 'discord-guild-1',
        name: 'Setup Guild',
        status: 'pending',
        created_by_discord_id: 'installer-1',
      }),
    )
    expect(mocks.roleRewardsUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          guild_id: 'tenant-created',
          role_name: 'Caller',
          silver: 0,
        }),
      ]),
      { onConflict: 'guild_id,role_name' },
    )
    expect(mocks.logTenantOnboardingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'tenant-created',
        actorDiscordId: 'installer-1',
        eventType: 'bot_installed',
        details: expect.objectContaining({
          discordGuildId: 'discord-guild-1',
          guildName: 'Setup Guild',
          createdTenant: true,
          source: 'discord_setup_command',
        }),
      }),
    )
  })

  it('routes /agm verify through Discord reauth before Albion onboarding', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()

    const response = await handleSlashCommand(agmPayload('verify'))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('Albion verification')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/api/auth/discord/start?returnTo=%2Fonboarding%2Falbion&retry=1',
    )
  })

  it('routes /agm events to the events list and the next event when one exists', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()
    mocks.eventMaybeSingle.mockResolvedValueOnce({
      data: {
        id: 'event-1',
        title: 'CTA',
        gather_at: '2026-05-29T12:00:00.000Z',
      },
    })

    const response = await handleSlashCommand(agmPayload('events'))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('events')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/events',
    )
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/events/event-1',
    )
    expect(mocks.eventGuild).toHaveBeenCalledWith('guild_id', 'tenant-1')
  })

  it('returns a personal quick starter with canonical resolver link buttons', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()

    const response = await handleSlashCommand(agmPayload('quick'))
    const data = response.data as {
      content?: string
      flags?: number
      components?: Array<{
        type: number
        components: Array<{ type: number; style: number; label: string; url: string }>
      }>
    } | undefined

    expect(data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(data?.content).toContain('quick starter')
    expect(data?.components).toHaveLength(2)
    expect(data?.components?.[0]?.components).toHaveLength(4)
    expect(data?.components?.[1]?.components).toHaveLength(4)
    expect(data?.components?.[0]?.components[0]).toMatchObject({
      type: 2,
      style: 5,
      label: 'Verify',
      url: 'https://albion-guildmanager.com/discord/open?guild=discord-guild-1&dest=verify',
    })
    expect(data?.components?.[1]?.components[3]).toMatchObject({
      type: 2,
      style: 5,
      label: 'Guide',
      url: 'https://albion-guildmanager.com/discord/open?guild=discord-guild-1&dest=guide',
    })
    expect(data?.components?.flatMap((row) => row.components).every((button) => (
      button.url.startsWith('https://albion-guildmanager.com/discord/open?')
    ))).toBe(true)
  })

  it('blocks /agm admin when the caller is not a site admin', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()
    mocks.overrideMaybeSingle.mockResolvedValueOnce({ data: null })

    const response = await handleSlashCommand(
      agmPayload('admin', {
        member: {
          user: { id: 'member-1', username: 'member' },
          roles: ['member-role'],
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('site admins')
    expect(response.data?.content).not.toContain('/admin/dashboard')
    expect(mocks.overrideEqTenant).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    expect(mocks.overrideEqDiscord).toHaveBeenCalledWith('discord_id', 'member-1')
  })

  it('blocks /agm killbot settings when the caller is not a site admin', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()
    mocks.overrideMaybeSingle.mockResolvedValueOnce({ data: null })

    const response = await handleSlashCommand(
      agmPayload('killbot', {
        member: {
          user: { id: 'member-1', username: 'member' },
          roles: ['member-role'],
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('site admins')
    expect(response.data?.content).not.toContain('/admin/dashboard/killbot')
  })

  it('allows /agm admin for a caller with the configured site admin role', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant({ adminRoleIds: ['admin-role'] })

    const response = await handleSlashCommand(
      agmPayload('admin', {
        member: {
          user: { id: 'admin-1', username: 'admin' },
          roles: ['admin-role'],
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('admin dashboard')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/admin/dashboard',
    )
    expect(mocks.overrideMaybeSingle).not.toHaveBeenCalled()

    mockTenant({ adminRoleIds: ['admin-role'] })
    const killbotResponse = await handleSlashCommand(
      agmPayload('killbot', {
        member: {
          user: { id: 'admin-1', username: 'admin' },
          roles: ['admin-role'],
        },
      }),
    )
    expect(killbotResponse.data?.content).toContain('Settings')
    expect(killbotResponse.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/admin/dashboard/killbot',
    )
  })

  it('allows /agm admin for tenant owners and explicit site admin overrides', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant({ createdByDiscordId: 'owner-1' })

    const ownerResponse = await handleSlashCommand(
      agmPayload('admin', {
        member: {
          user: { id: 'owner-1', username: 'owner' },
          roles: [],
        },
      }),
    )
    expect(ownerResponse.data?.content).toContain('/admin/dashboard')
    expect(mocks.overrideMaybeSingle).not.toHaveBeenCalled()

    mockTenant({ createdByDiscordId: 'owner-1' })
    mocks.overrideMaybeSingle.mockResolvedValueOnce({ data: { discord_id: 'override-1' } })

    const overrideResponse = await handleSlashCommand(
      agmPayload('admin', {
        member: {
          user: { id: 'override-1', username: 'override' },
          roles: [],
        },
      }),
    )
    expect(overrideResponse.data?.content).toContain('/admin/dashboard')
  })

  it('publishes a quiet quick starter panel for site admins', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant({ adminRoleIds: ['admin-role'] })

    const response = await handleSlashCommand(
      agmPayload('publish-quick', {
        channel_id: 'channel-1',
        member: {
          user: { id: 'admin-1', username: 'admin' },
          roles: ['admin-role'],
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('posted')
    expect(mocks.sendDiscordChannelMessage).toHaveBeenCalledWith(
      'channel-1',
      expect.objectContaining({
        content: expect.stringContaining('quick starter'),
        allowed_mentions: { parse: [] },
        components: expect.any(Array),
      }),
    )
    const payload = mocks.sendDiscordChannelMessage.mock.calls[0]?.[1] as {
      components?: Array<{ components: Array<{ url: string }> }>
    }
    expect(payload.components?.[0]?.components[0]?.url).toBe(
      'https://albion-guildmanager.com/discord/open?guild=discord-guild-1&dest=verify',
    )
  })

  it('blocks /agm publish-quick when the caller is not a site admin', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()
    mocks.overrideMaybeSingle.mockResolvedValueOnce({ data: null })

    const response = await handleSlashCommand(
      agmPayload('publish-quick', {
        channel_id: 'channel-1',
        member: {
          user: { id: 'member-1', username: 'member' },
          roles: ['member-role'],
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('site admins')
    expect(mocks.sendDiscordChannelMessage).not.toHaveBeenCalled()
  })

  it('blocks /agm points when the caller is not a site admin', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()
    mocks.overrideMaybeSingle.mockResolvedValueOnce({ data: null })

    const response = await handleSlashCommand(
      agmPointsPayload(
        { delta: 500 },
        {
          member: {
            user: { id: 'member-2', username: 'member' },
            roles: ['member-role'],
          },
        },
      ),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('site admins')
    expect(mocks.pointLedgerInsert).not.toHaveBeenCalled()
    expect(mocks.adminAuditInsert).not.toHaveBeenCalled()
  })

  it('allows /agm points for a site admin and writes a tenant-scoped ledger adjustment', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant({ adminRoleIds: ['admin-role'] })

    const response = await handleSlashCommand(
      agmPointsPayload({ delta: -2500, memo: 'attendance correction' }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('points adjusted')
    expect(response.data?.content).toContain('Member One')
    expect(response.data?.content).toContain('-2,500')
    expect(mocks.pointMemberEqGuild).toHaveBeenCalledWith('guild_id', 'tenant-1')
    expect(mocks.pointMemberEqDiscord).toHaveBeenCalledWith('discord_id', 'member-1')
    expect(mocks.pointLedgerInsert).toHaveBeenCalledWith({
      guild_id: 'tenant-1',
      discord_id: 'member-1',
      delta: -2500,
      reason: 'admin_adjust',
      memo: 'attendance correction',
      handled_by: 'admin-1',
      handled_by_username: 'Admin Nick',
    })
    expect(mocks.adminAuditInsert).toHaveBeenCalledWith({
      guild_id: 'tenant-1',
      admin_discord_id: 'admin-1',
      action: 'points.adjust',
      target_id: null,
      target_kind: 'member',
      target_discord_id: 'member-1',
      details: {
        delta: -2500,
        memo: 'attendance correction',
        source: 'discord_command',
      },
    })
  })

  it('rejects /agm points when the target is not a linked guild member', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant({ adminRoleIds: ['admin-role'] })
    mocks.pointMemberMaybeSingle.mockResolvedValueOnce({ data: null })

    const response = await handleSlashCommand(
      agmPointsPayload({ targetDiscordId: 'not-member', delta: 500 }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('linked guild member')
    expect(mocks.pointLedgerInsert).not.toHaveBeenCalled()
    expect(mocks.adminAuditInsert).not.toHaveBeenCalled()
  })

  it('shows only the public guide links for /agm guide without a guild context', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')

    const response = await handleSlashCommand(agmPayload('guide', { guild_id: undefined }))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('Guides')
    expect(response.data?.content).toContain(
      'https://albion-guildmanager.com/member-quick-guide.html',
    )
    expect(response.data?.content).toContain('https://albion-guildmanager.com/faq')
    expect(mocks.from).not.toHaveBeenCalled()
  })
})
