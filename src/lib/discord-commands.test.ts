import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ALL_COMMAND_NAMES,
  COMMAND_AGM,
  handleSlashCommand,
} from './discord-commands'
import discordCommandCatalog from './discord-command-catalog.json'
import { MESSAGE_FLAG_EPHEMERAL } from './discord-interactions'
import type {
  DiscordInteractionOption,
  DiscordInteractionPayload,
} from './discord-interactions'

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

  const eventMaybeSingle = vi.fn(async () => ({ data: null as unknown, error: null as unknown }))
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
  const exchangeInsertSingle = vi.fn(async () => ({
    data: { id: 'exchange-1' } as unknown,
    error: null as unknown,
  }))
  const exchangeInsertSelect = vi.fn(() => ({ single: exchangeInsertSingle }))
  const exchangeInsert = vi.fn(() => ({ select: exchangeInsertSelect }))
  const appSettingsRows: Array<{ key: string; value: string }> = []
  const appSettingsIn = vi.fn(async () => ({
    data: appSettingsRows,
    error: null as unknown,
  }))
  const appSettingsEq = vi.fn(() => ({ in: appSettingsIn }))
  const appSettingsSelect = vi.fn(() => ({ eq: appSettingsEq }))
  const appSettingsUpsert = vi.fn(async () => ({ error: null as unknown }))
  const getMemberSpendablePointBalance = vi.fn(async () => ({
    balance: 4200,
    escrowed: 500,
    spendable: 3700,
    error: undefined as string | undefined,
  }))
  const getAlbionOnboardingGateState = vi.fn(async () => ({
    resourceTrusted: true,
  }))
  const sendAdminNotification = vi.fn(async () => ({ sent: true }))

  const from = vi.fn((table: string) => {
    if (table === 'tenants') return { select: tenantSelect, insert: tenantInsert }
    if (table === 'tenant_admin_overrides') return { select: overrideSelect }
    if (table === 'events') return { select: eventSelect }
    if (table === 'guild_avatars') return { select: guildAvatarSelect }
    if (table === 'guests') return { select: guestLanguageSelect }
    if (table === 'point_ledger') return { insert: pointLedgerInsert }
    if (table === 'admin_audit_log') return { insert: adminAuditInsert }
    if (table === 'role_rewards') return { upsert: roleRewardsUpsert }
    if (table === 'exchange_requests') return { insert: exchangeInsert }
    if (table === 'app_settings') {
      return { select: appSettingsSelect, upsert: appSettingsUpsert }
    }
    throw new Error(`Unexpected table: ${table}`)
  })

  const getDiscordGuild = vi.fn(async () => ({
    id: 'discord-guild-1',
    name: 'Setup Guild',
    icon: null,
  }))
  const sendDiscordChannelMessage = vi.fn(async () => 'quick-message-1')
  const updateDiscordChannelMessage = vi.fn(async () => undefined)
  const logTenantOnboardingEvent = vi.fn(async () => {})

  return {
    adminAuditInsert,
    appSettingsEq,
    appSettingsIn,
    appSettingsRows,
    appSettingsSelect,
    appSettingsUpsert,
    eventBattleStarted,
    eventGte,
    eventGuild,
    eventMaybeSingle,
    eventOrder,
    eventStatus,
    exchangeInsert,
    exchangeInsertSelect,
    exchangeInsertSingle,
    from,
    getAlbionOnboardingGateState,
    getMemberSpendablePointBalance,
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
    sendAdminNotification,
    tenantAnyMaybeSingle,
    tenantEqGuild,
    tenantEqStatus,
    tenantInsert,
    tenantInsertSelect,
    tenantInsertSingle,
    tenantMaybeSingle,
    getDiscordGuild,
    sendDiscordChannelMessage,
    updateDiscordChannelMessage,
    logTenantOnboardingEvent,
  }
})

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({ from: mocks.from }),
}))

vi.mock('@/lib/discord', () => ({
  DiscordChannelMessageError: class DiscordChannelMessageError extends Error {
    status: number
    discordCode: number | null

    constructor(status: number, discordCode: number | null, message: string) {
      super(message)
      this.name = 'DiscordChannelMessageError'
      this.status = status
      this.discordCode = discordCode
    }
  },
  getDiscordGuild: mocks.getDiscordGuild,
  sendDiscordChannelMessage: mocks.sendDiscordChannelMessage,
  updateDiscordChannelMessage: mocks.updateDiscordChannelMessage,
}))

vi.mock('@/lib/tenant-onboarding-events', () => ({
  logTenantOnboardingEvent: mocks.logTenantOnboardingEvent,
}))

vi.mock('@/lib/point-ledger', () => ({
  getMemberSpendablePointBalance: mocks.getMemberSpendablePointBalance,
}))

vi.mock('@/lib/albion-identity', () => ({
  getAlbionOnboardingGateState: mocks.getAlbionOnboardingGateState,
}))

vi.mock('@/lib/admin-notifications', () => ({
  sendAdminNotification: mocks.sendAdminNotification,
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

function agmOpenPayload(
  page: string,
  overrides: Partial<DiscordInteractionPayload> = {},
) {
  return agmPayload(
    'open',
    {
      data: {
        id: 'cmd-agm',
        name: COMMAND_AGM,
        type: 1,
        options: [
          {
            name: 'open',
            type: 1,
            options: [
              { name: 'page', type: 3, value: page },
            ],
          },
        ],
      },
      ...overrides,
    },
  )
}

function agmGroupedPayload(
  group: string,
  subcommand: string,
  subcommandOptions: DiscordInteractionOption[] = [],
  overrides: Partial<DiscordInteractionPayload> = {},
) {
  return agmPayload(
    group,
    {
      data: {
        id: 'cmd-agm',
        name: COMMAND_AGM,
        type: 1,
        options: [
          {
            name: group,
            type: 2,
            options: [
              {
                name: subcommand,
                type: 1,
                options: subcommandOptions,
              },
            ],
          },
        ],
      },
      ...overrides,
    },
  )
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

function agmWithdrawPayload(
  options: {
    amount?: number
  } = {},
  overrides: Partial<DiscordInteractionPayload> = {},
) {
  return agmPayload(
    'withdraw',
    {
      member: {
        nick: 'Member Nick',
        user: { id: 'member-1', username: 'member' },
        roles: ['member-role'],
      },
      data: {
        id: 'cmd-agm',
        name: COMMAND_AGM,
        type: 1,
        options: [
          {
            name: 'withdraw',
            type: 1,
            options: [
              { name: 'amount', type: 4, value: options.amount ?? 1500 },
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
    mocks.appSettingsRows.length = 0
  })

  it('registers only the agm command name in code', () => {
    expect(ALL_COMMAND_NAMES).toEqual([COMMAND_AGM])
  })

  it('registers grouped /agm commands with localized descriptions', () => {
    type CatalogOption = {
      name: string
      options?: CatalogOption[]
      choices?: Array<{ value: string }>
    }
    const agmCommand = discordCommandCatalog[0] as {
      name: string
      description_localizations: Record<string, string>
      options: CatalogOption[]
    }

    expect(agmCommand.name).toBe(COMMAND_AGM)
    expect(agmCommand.options.map((option) => option.name)).toEqual([
      'setup',
      'quick',
      'help',
      'guide',
      'open',
      'me',
      'wallet',
      'admin',
    ])
    expect(agmCommand.description_localizations.ko).toContain('Albion')
    expect(
      agmCommand.options.find((option) => option.name === 'open')?.options?.[0]?.choices?.map(
        (choice) => choice.value,
      ),
    ).toEqual(['home', 'events', 'regear', 'shop', 'craft'])
    expect(
      agmCommand.options.find((option) => option.name === 'wallet')?.options?.map(
        (option) => option.name,
      ),
    ).toEqual(['open', 'balance', 'withdraw'])
    expect(
      agmCommand.options.find((option) => option.name === 'admin')?.options?.map(
        (option) => option.name,
      ),
    ).toEqual(['dashboard', 'points', 'quick-publish', 'killbot'])
  })

  it('shows member-focused /agm help without admin commands', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')

    const response = await handleSlashCommand(agmPayload('help', { guild_id: undefined }))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('/agm me verify')
    expect(response.data?.content).toContain('/agm wallet balance')
    expect(response.data?.content).toContain('/agm wallet withdraw amount:1000')
    expect(response.data?.content).toContain('/agm open page:events')
    expect(response.data?.content).toContain('https://albion-guildmanager.com/member-quick-guide.html')
    expect(response.data?.content).not.toContain('/agm admin')
    expect(mocks.from).not.toHaveBeenCalled()
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

  it('uses English /agm command text without reading saved site language', async () => {
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
    expect(mocks.memberLanguageMaybeSingle).not.toHaveBeenCalled()
    expect(mocks.guestLanguageMaybeSingle).not.toHaveBeenCalled()
  })

  it('points unlinked guilds to help and admin setup', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')

    const response = await handleSlashCommand(agmPayload('wallet'))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('/agm help')
    expect(response.data?.content).toContain('/agm setup')
    expect(response.data?.content).toContain('https://albion-guildmanager.com/faq')
  })

  it('keeps /agm command text in English even when a Korean site language is saved', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()

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
    expect(response.data?.content).toContain('my wallet')
    expect(response.data?.content).not.toContain('내 지갑')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/me/wallet',
    )
    expect(mocks.memberLanguageMaybeSingle).not.toHaveBeenCalled()
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

  it('routes /agm open page:events to the events entry point', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()

    const response = await handleSlashCommand(agmOpenPayload('events'))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('events')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/events',
    )
  })

  it('routes /agm me verify through Discord reauth before Albion onboarding', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()

    const response = await handleSlashCommand(agmGroupedPayload('me', 'verify'))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('Albion verification')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/api/auth/discord/start?returnTo=%2Fonboarding%2Falbion&retry=1',
    )
  })

  it('shows the invoking member point balance from /agm wallet balance', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()

    const response = await handleSlashCommand(
      agmGroupedPayload('wallet', 'balance', [], {
        member: {
          user: { id: 'member-1', username: 'member' },
          roles: ['member-role'],
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('point balance')
    expect(response.data?.content).toContain('Spendable: 3,700p')
    expect(mocks.getMemberSpendablePointBalance).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      'member-1',
    )
  })

  it('creates a self-service exchange request from /agm wallet withdraw', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()

    const response = await handleSlashCommand(
      agmGroupedPayload(
        'wallet',
        'withdraw',
        [{ name: 'amount', type: 4, value: 1500 }],
        {
          member: {
            nick: 'Member Nick',
            user: { id: 'member-1', username: 'member' },
            roles: ['member-role'],
          },
        },
      ),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('withdrawal request created')
    expect(mocks.exchangeInsert).toHaveBeenCalledWith({
      guild_id: 'tenant-1',
      discord_id: 'member-1',
      username: 'Member One',
      silver: 1500,
    })
  })

  it('shows the invoking member point balance with spendable points from /agm balance', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()

    const response = await handleSlashCommand(
      agmPayload('balance', {
        member: {
          user: { id: 'member-1', username: 'member' },
          roles: ['member-role'],
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('point balance')
    expect(response.data?.content).toContain('Balance: 4,200p')
    expect(response.data?.content).toContain('Held: 500p')
    expect(response.data?.content).toContain('Spendable: 3,700p')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/me/wallet',
    )
    expect(mocks.pointMemberEqGuild).toHaveBeenCalledWith('guild_id', 'tenant-1')
    expect(mocks.pointMemberEqDiscord).toHaveBeenCalledWith('discord_id', 'member-1')
    expect(mocks.getMemberSpendablePointBalance).toHaveBeenCalledWith(
      expect.anything(),
      'tenant-1',
      'member-1',
    )
  })

  it('creates a self-service exchange request from /agm withdraw', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()

    const response = await handleSlashCommand(agmWithdrawPayload({ amount: 1500 }))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('withdrawal request created')
    expect(response.data?.content).toContain('Amount: 1,500p')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/me/wallet',
    )
    expect(mocks.exchangeInsert).toHaveBeenCalledWith({
      guild_id: 'tenant-1',
      discord_id: 'member-1',
      username: 'Member One',
      silver: 1500,
    })
    expect(mocks.sendAdminNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'tenant-1',
        topic: 'exchange',
        sourceTable: 'exchange_requests',
        sourceId: 'exchange-1',
        url: '/admin/dashboard/approvals?tab=exchange',
      }),
    )
  })

  it('rejects /agm withdraw when spendable points are insufficient', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()
    mocks.getMemberSpendablePointBalance.mockResolvedValueOnce({
      balance: 1000,
      escrowed: 0,
      spendable: 1000,
      error: undefined,
    })

    const response = await handleSlashCommand(agmWithdrawPayload({ amount: 1500 }))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('Insufficient spendable points')
    expect(response.data?.content).toContain('Spendable: 1,000p')
    expect(response.data?.content).toContain('/agm wallet balance')
    expect(mocks.exchangeInsert).not.toHaveBeenCalled()
    expect(mocks.sendAdminNotification).not.toHaveBeenCalled()
  })

  it('rejects /agm withdraw until the invoking member is Albion verified', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()
    mocks.getAlbionOnboardingGateState.mockResolvedValueOnce({ resourceTrusted: false })

    const response = await handleSlashCommand(agmWithdrawPayload({ amount: 1500 }))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('Albion verification is required')
    expect(response.data?.content).toContain('/agm me verify')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/onboarding/albion',
    )
    expect(mocks.exchangeInsert).not.toHaveBeenCalled()
  })

  it('maps duplicate pending exchange requests to the Discord withdraw response', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()
    mocks.exchangeInsertSingle.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate pending exchange' },
    })

    const response = await handleSlashCommand(agmWithdrawPayload({ amount: 1500 }))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('pending withdrawal request')
    expect(response.data?.content).toContain('/agm wallet open')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/me/wallet',
    )
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
      error: null,
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
    const data = response.data as {
      components?: Array<{
        components: Array<{ label?: string }>
      }>
    } | undefined
    expect(data?.components?.[0]?.components.map((component) => component.label)).toEqual([
      'Join intent',
      'Apply by code',
      'Browse slots',
      'My status',
      'Open web',
    ])
    expect(mocks.eventGuild).toHaveBeenCalledWith('guild_id', 'tenant-1')
  })

  it('keeps /agm events usable when the next event lookup fails', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()
    mocks.eventMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'temporary database error' },
    })

    const response = await handleSlashCommand(agmPayload('events'))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/events',
    )
    expect(response.data?.content).not.toContain('Next event')
  })

  it('returns a personal quick starter with canonical resolver link buttons', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()

    const response = await handleSlashCommand(
      agmPayload('quick', {
        member: {
          user: { id: 'member-1', username: 'member' },
          roles: [],
        },
      }),
    )
    const data = response.data as {
      content?: string
      flags?: number
      components?: Array<{
        type: number
        components: Array<{
          type: number
          style: number
          label: string
          emoji?: { name: string }
          url: string
        }>
      }>
    } | undefined

    expect(data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(data?.content).toContain('Quick Starter')
    expect(data?.content).toContain('/agm help')
    expect(data?.content).not.toContain('아래')
    expect(data?.components).toHaveLength(2)
    expect(data?.components?.[0]?.components).toHaveLength(4)
    expect(data?.components?.[1]?.components).toHaveLength(4)
    expect(data?.components?.[0]?.components[0]).toMatchObject({
      type: 2,
      style: 5,
      label: 'Verify',
      emoji: { name: '✅' },
      url: 'https://albion-guildmanager.com/discord/open?guild=discord-guild-1&dest=verify',
    })
    expect(data?.components?.[0]?.components[3]).toMatchObject({
      type: 2,
      style: 5,
      label: 'Guide',
      emoji: { name: '📘' },
      url: 'https://albion-guildmanager.com/discord/open?guild=discord-guild-1&dest=guide',
    })
    expect(data?.components?.[1]?.components[0]).toMatchObject({
      type: 2,
      style: 5,
      label: 'Regear',
      emoji: { name: '🛡️' },
      url: 'https://albion-guildmanager.com/discord/open?guild=discord-guild-1&dest=regear',
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

  it('routes /agm admin dashboard for a caller with the configured site admin role', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant({ adminRoleIds: ['admin-role'] })

    const response = await handleSlashCommand(
      agmGroupedPayload('admin', 'dashboard', [], {
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

  it('publishes a quiet persistent guide panel for site admins and stores its message id', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant({ adminRoleIds: ['admin-role'] })

    const response = await handleSlashCommand(
      agmGroupedPayload('admin', 'quick-publish', [], {
        channel_id: 'channel-1',
        member: {
          user: { id: 'admin-1', username: 'admin' },
          roles: ['admin-role'],
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('published or updated')
    expect(mocks.updateDiscordChannelMessage).not.toHaveBeenCalled()
    expect(mocks.sendDiscordChannelMessage).toHaveBeenCalledWith(
      'channel-1',
      expect.objectContaining({
        content: '',
        embeds: [
          expect.objectContaining({
            title: expect.stringContaining('Quick Starter'),
            description: expect.stringContaining('/agm help'),
          }),
        ],
        allowed_mentions: { parse: [] },
        components: expect.any(Array),
      }),
    )
    const sentCall = mocks.sendDiscordChannelMessage.mock.calls[0] as unknown as [
      string,
      {
        embeds?: Array<{ title?: string; description?: string }>
        components?: Array<{ components: Array<{ url: string }> }>
      },
    ] | undefined
    const payload = sentCall?.[1] as {
      embeds?: Array<{ title?: string; description?: string }>
      components?: Array<{ components: Array<{ url: string }> }>
    } | undefined
    expect(payload).toBeDefined()
    expect(payload!.embeds?.[0]?.title).toBe('Menhera Quick Starter')
    expect(payload!.embeds?.[0]?.description).toContain('Use the buttons below')
    expect(payload!.components?.[0]?.components[0]?.url).toBe(
      'https://albion-guildmanager.com/discord/open?guild=discord-guild-1&dest=verify',
    )
    expect(mocks.appSettingsEq).toHaveBeenCalledWith('guild_id', 'tenant-1')
    expect(mocks.appSettingsUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          guild_id: 'tenant-1',
          key: 'quick_starter_panel_channel_id',
          value: 'channel-1',
        }),
        expect.objectContaining({
          guild_id: 'tenant-1',
          key: 'quick_starter_panel_message_id',
          value: 'quick-message-1',
        }),
        expect.objectContaining({
          guild_id: 'tenant-1',
          key: 'quick_starter_panel_message_channel_id',
          value: 'channel-1',
        }),
      ]),
      { onConflict: 'guild_id,key' },
    )
  })

  it('updates the saved guide panel message instead of posting duplicates', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant({ adminRoleIds: ['admin-role'] })
    mocks.appSettingsRows.push(
      { key: 'quick_starter_panel_title', value: '{name} Member Guide' },
      { key: 'quick_starter_panel_description', value: 'Pinned guide for {name}.' },
      { key: 'quick_starter_panel_message_id', value: 'message-9' },
      { key: 'quick_starter_panel_message_channel_id', value: 'channel-1' },
    )

    const response = await handleSlashCommand(
      agmGroupedPayload('admin', 'quick-publish', [], {
        channel_id: 'channel-1',
        member: {
          user: { id: 'admin-1', username: 'admin' },
          roles: ['admin-role'],
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('published or updated')
    expect(mocks.updateDiscordChannelMessage).toHaveBeenCalledWith(
      'channel-1',
      'message-9',
      expect.objectContaining({
        embeds: [
          expect.objectContaining({
            title: 'Menhera Member Guide',
            description: 'Pinned guide for Menhera.',
          }),
        ],
        allowed_mentions: { parse: [] },
      }),
    )
    expect(mocks.sendDiscordChannelMessage).not.toHaveBeenCalled()
    expect(mocks.appSettingsUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          guild_id: 'tenant-1',
          key: 'quick_starter_panel_message_id',
          value: 'message-9',
        }),
      ]),
      { onConflict: 'guild_id,key' },
    )
  })

  it('republishes the guide panel when the saved Discord message was deleted', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant({ adminRoleIds: ['admin-role'] })
    mocks.appSettingsRows.push(
      { key: 'quick_starter_panel_message_id', value: 'message-deleted' },
      { key: 'quick_starter_panel_message_channel_id', value: 'channel-1' },
    )
    const { DiscordChannelMessageError } = await import('@/lib/discord')
    mocks.updateDiscordChannelMessage.mockRejectedValueOnce(
      new DiscordChannelMessageError(404, 10008, 'Unknown Message'),
    )

    const response = await handleSlashCommand(
      agmGroupedPayload('admin', 'quick-publish', [], {
        channel_id: 'channel-1',
        member: {
          user: { id: 'admin-1', username: 'admin' },
          roles: ['admin-role'],
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(mocks.updateDiscordChannelMessage).toHaveBeenCalledWith(
      'channel-1',
      'message-deleted',
      expect.anything(),
    )
    expect(mocks.sendDiscordChannelMessage).toHaveBeenCalledWith('channel-1', expect.anything())
    expect(mocks.appSettingsUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          guild_id: 'tenant-1',
          key: 'quick_starter_panel_message_id',
          value: 'quick-message-1',
        }),
      ]),
      { onConflict: 'guild_id,key' },
    )
  })

  it('publishes a custom guide panel message with guild placeholders and saves it', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant({ adminRoleIds: ['admin-role'] })

    const response = await handleSlashCommand(
      agmPayload('publish-quick', {
        channel_id: 'channel-1',
        member: {
          user: { id: 'admin-1', username: 'admin' },
          roles: ['admin-role'],
        },
        data: {
          id: 'cmd-agm',
          name: COMMAND_AGM,
          type: 1,
          options: [
            {
              name: 'publish-quick',
              type: 1,
              options: [
                {
                  name: 'message',
                  type: 3,
                  value: 'Welcome to {name}.\nPick your next step below.',
                },
              ],
            },
          ],
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(mocks.sendDiscordChannelMessage).toHaveBeenCalledWith(
      'channel-1',
      expect.objectContaining({
        content: '',
        embeds: [
          expect.objectContaining({
            title: 'Menhera Quick Starter',
            description: 'Welcome to Menhera.\nPick your next step below.',
          }),
        ],
        allowed_mentions: { parse: [] },
      }),
    )
    expect(mocks.appSettingsUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          guild_id: 'tenant-1',
          key: 'quick_starter_panel_description',
          value: 'Welcome to {name}.\nPick your next step below.',
        }),
      ]),
      { onConflict: 'guild_id,key' },
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

  it('allows /agm admin points for a site admin and writes a tenant-scoped ledger adjustment', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant({ adminRoleIds: ['admin-role'] })

    const response = await handleSlashCommand(
      agmGroupedPayload(
        'admin',
        'points',
        [
          { name: 'member', type: 6, value: 'member-1' },
          { name: 'delta', type: 4, value: -2500 },
          { name: 'memo', type: 3, value: 'attendance correction' },
        ],
        {
          member: {
            nick: 'Admin Nick',
            user: { id: 'admin-1', username: 'admin' },
            roles: ['admin-role'],
          },
        },
      ),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('points adjusted')
    expect(mocks.pointLedgerInsert).toHaveBeenCalledWith({
      guild_id: 'tenant-1',
      discord_id: 'member-1',
      delta: -2500,
      reason: 'admin_adjust',
      memo: 'attendance correction',
      handled_by: 'admin-1',
      handled_by_username: 'Admin Nick',
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
