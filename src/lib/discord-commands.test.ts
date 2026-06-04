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
  const tenantEqGuild = vi.fn(() => ({ eq: tenantEqStatus }))
  const tenantSelect = vi.fn(() => ({ eq: tenantEqGuild }))

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
  const memberLanguageSelect = vi.fn(() => ({ eq: memberLanguageEqGuild }))

  const guestLanguageMaybeSingle = vi.fn(async () => ({ data: null as unknown }))
  const guestLanguageEqDiscord = vi.fn(() => ({ maybeSingle: guestLanguageMaybeSingle }))
  const guestLanguageEqGuild = vi.fn(() => ({ eq: guestLanguageEqDiscord }))
  const guestLanguageSelect = vi.fn(() => ({ eq: guestLanguageEqGuild }))

  const from = vi.fn((table: string) => {
    if (table === 'tenants') return { select: tenantSelect }
    if (table === 'tenant_admin_overrides') return { select: overrideSelect }
    if (table === 'events') return { select: eventSelect }
    if (table === 'guild_avatars') return { select: memberLanguageSelect }
    if (table === 'guests') return { select: guestLanguageSelect }
    throw new Error(`Unexpected table: ${table}`)
  })

  return {
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
    memberLanguageEqDiscord,
    memberLanguageEqGuild,
    memberLanguageMaybeSingle,
    overrideEqDiscord,
    overrideEqTenant,
    overrideMaybeSingle,
    tenantEqGuild,
    tenantEqStatus,
    tenantMaybeSingle,
  }
})

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({ from: mocks.from }),
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

function mockTenant(
  options: {
    createdByDiscordId?: string | null
    adminRoleIds?: string[]
  } = {},
) {
  mocks.tenantMaybeSingle.mockResolvedValueOnce({
    data: {
      id: 'tenant-1',
      slug: 'menhera',
      name: 'Menhera',
      created_by_discord_id: options.createdByDiscordId ?? 'owner-1',
      admin_role_ids: options.adminRoleIds ?? ['admin-role'],
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
