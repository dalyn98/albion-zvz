import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ALL_COMMAND_NAMES,
  COMMAND_AGM,
  handleDiscordAppLoginInteraction,
  handleSlashCommand,
} from './discord-commands'
import discordCommandCatalog from './discord-command-catalog.mjs'
import { MESSAGE_FLAG_EPHEMERAL, MESSAGE_FLAG_SUPPRESS_EMBEDS } from './discord-interactions'
import type {
  DiscordInteractionOption,
  DiscordInteractionPayload,
  DiscordInteractionResponse,
} from './discord-interactions'

vi.mock('@/lib/app-settings-invalidation', () => ({
  revalidateAppSettingsCache: vi.fn(),
}))
vi.mock('@/lib/tenant-cache', () => ({
  revalidateTenantDirectoryCache: vi.fn(),
}))

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

  const permissionRoleIn = vi.fn(
    async (_column: string, roleIds: readonly string[]) => ({
      data: roleIds.includes('admin-role')
        ? [{ capabilities: '17179869184' }]
        : [],
      error: null as unknown,
    }),
  )
  const permissionRoleEqGuild = vi.fn(() => ({ in: permissionRoleIn }))
  const permissionRoleSelect = vi.fn(() => ({ eq: permissionRoleEqGuild }))

  const permissionUserMaybeSingle = vi.fn(async () => ({
    data: null as unknown,
    error: null as unknown,
  }))
  const permissionUserGtExpiry = vi.fn(() => ({
    maybeSingle: permissionUserMaybeSingle,
  }))
  const permissionUserIsRevoked = vi.fn(() => ({
    gt: permissionUserGtExpiry,
  }))
  const permissionUserEqDiscord = vi.fn(() => ({
    is: permissionUserIsRevoked,
  }))
  const permissionUserEqGuild = vi.fn(() => ({
    eq: permissionUserEqDiscord,
  }))
  const permissionUserSelect = vi.fn(() => ({
    eq: permissionUserEqGuild,
  }))

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
  const rpc = vi.fn(async (name: string) => {
    if (name === 'submit_exchange_request') {
      return { data: 'exchange-1' as unknown, error: null as unknown }
    }
    throw new Error(`Unexpected RPC: ${name}`)
  })
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
  const getAdminNotificationTranslations = vi.fn(async () => ({
    locale: 'ko',
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${JSON.stringify(values)}` : key,
  }))
  const parseDiscordAppLoginCustomId = vi.fn()
  const approveDiscordBrowserAuthAttempt = vi.fn(async () => true)
  const createDiscordAppLoginLink = vi.fn(async (input: {
    tenantSlug: string
    returnTo: string
  }) =>
    `https://${input.tenantSlug}.albion-guildmanager.com/api/auth/discord/app/consume?id=11111111-1111-4111-8111-111111111111&token=valid-token&returnTo=${encodeURIComponent(input.returnTo)}`,
  )

  const from = vi.fn((table: string) => {
    if (table === 'tenants') return { select: tenantSelect, insert: tenantInsert }
    if (table === 'tenant_admin_overrides') return { select: overrideSelect }
    if (table === 'permission_role_grants') {
      return { select: permissionRoleSelect }
    }
    if (table === 'permission_user_overrides') {
      return { select: permissionUserSelect }
    }
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
    approveDiscordBrowserAuthAttempt,
    createDiscordAppLoginLink,
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
    parseDiscordAppLoginCustomId,
    roleRewardsUpsert,
    rpc,
    sendAdminNotification,
    getAdminNotificationTranslations,
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
  getAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }),
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
  mapDiscordLocale: (locale?: string | null) => {
    if (!locale) return null
    const language = locale.toLowerCase().split('-')[0]
    return ['en', 'ko', 'ja', 'zh'].includes(language) ? language : null
  },
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
  getAdminNotificationTranslations: mocks.getAdminNotificationTranslations,
}))

vi.mock('@/lib/guild-features-server', () => ({
  checkGuildFeatureUse: vi.fn(async (_guildId: string, boundary: { key: string }) => ({
    allowed: true,
    feature: { key: boundary.key, state: 'enabled', config: {} },
  })),
  loadGuildFeatureSnapshot: vi.fn(async () => ({
    workspace: { key: 'workspace', state: 'enabled', config: {} },
    events: { key: 'events', state: 'enabled', config: {} },
    members: { key: 'members', state: 'enabled', config: {} },
    member_self_service: { key: 'member_self_service', state: 'enabled', config: {} },
    settings_and_permissions: { key: 'settings_and_permissions', state: 'enabled', config: {} },
    operation_assets: { key: 'operation_assets', state: 'enabled', config: {} },
    tactics: { key: 'tactics', state: 'enabled', config: {} },
    supply: { key: 'supply', state: 'enabled', config: {} },
    guild_economy: { key: 'guild_economy', state: 'enabled', config: {} },
    guild_shop: { key: 'guild_shop', state: 'enabled', config: {} },
    member_market: { key: 'member_market', state: 'enabled', config: {} },
    asset_accounting: { key: 'asset_accounting', state: 'enabled', config: {} },
    insights: { key: 'insights', state: 'enabled', config: {} },
    public_guild_profile: { key: 'public_guild_profile', state: 'enabled', config: {} },
  })),
}))

vi.mock('@/lib/regear-support-server', () => ({
  isCraftedRegearSupported: vi.fn(async () => true),
  isRegearIntakeEnabled: vi.fn(async () => true),
}))

vi.mock('@/lib/discord-app-login', () => ({
  buildDiscordAppLoginCustomId: (destination: string) => `agm_login:v1:${destination}`,
  createDiscordAppLoginLink: mocks.createDiscordAppLoginLink,
  discordAppLoginReturnPath: (destination: string) => {
    const paths: Record<string, string> = {
      verify: '/onboarding/albion',
      events: '/events',
      me: '/me',
      guide: '/member-quick-guide.html',
      regear: '/regear',
      shop: '/shop',
      wallet: '/me/wallet',
      craft: '/craft/queue',
    }
    return paths[destination] ?? '/'
  },
  parseDiscordAppLoginCustomId: mocks.parseDiscordAppLoginCustomId,
}))

vi.mock('@/lib/discord-browser-auth', () => ({
  approveDiscordBrowserAuthAttempt: mocks.approveDiscordBrowserAuthAttempt,
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
    locale: 'en-US',
    member: {
      user: { id: 'member-1', username: 'member' },
      roles: [],
    },
    ...overrides,
  } as DiscordInteractionPayload
}

function expectMagicLinkDeliveredOnlyByButton(
  response: DiscordInteractionResponse,
  expectedButtonCount = 1,
) {
  const data = response.data as {
    content?: string
    flags?: number
    components?: Array<{
      components: Array<{ type?: number; style?: number; url?: string }>
    }>
  } | undefined
  const magicButtons = data?.components
    ?.flatMap((row) => row.components)
    .filter((component) => component.url?.includes('/api/auth/discord/app/consume'))

  expect(data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL | MESSAGE_FLAG_SUPPRESS_EMBEDS)
  expect(data?.content).not.toContain('/api/auth/discord/app/consume')
  expect(magicButtons).toHaveLength(expectedButtonCount)
  expect(magicButtons?.[0]).toMatchObject({ type: 2, style: 5 })
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
  return agmGroupedPayload(
    'admin',
    'points',
    [
      { name: 'member', type: 6, value: options.targetDiscordId ?? 'member-1' },
      { name: 'delta', type: 4, value: options.delta ?? 1000 },
      { name: 'memo', type: 3, value: options.memo ?? 'manual correction' },
    ],
    {
      member: {
        nick: 'Admin Nick',
        user: { id: 'admin-1', username: 'admin' },
        roles: ['admin-role'],
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
  return agmGroupedPayload(
    'wallet',
    'withdraw',
    [{ name: 'amount', type: 4, value: options.amount ?? 1500 }],
    {
      member: {
        nick: 'Member Nick',
        user: { id: 'member-1', username: 'member' },
        roles: ['member-role'],
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
      'login',
      'help',
      'me',
      'event',
      'wallet',
      'stats',
      'regear',
      'craft',
      'siphon',
      'shop',
      'admin',
    ])
    expect(agmCommand.description_localizations.ko).toContain('Albion')
    expect(
      agmCommand.options.find((option) => option.name === 'wallet')?.options?.map(
        (option) => option.name,
      ),
    ).toEqual(['balance', 'send', 'withdraw', 'history'])
    expect(
      agmCommand.options.find((option) => option.name === 'admin')?.options?.map(
        (option) => option.name,
      ),
    ).toEqual([
      'approvals',
      'event-create',
      'event-start',
      'points',
      'quick-publish',
      'dashboard',
    ])
  })

  it('approves a browser-bound code using the signed guild and member identity', async () => {
    mockTenant()
    const payload = agmPayload('login')
    payload.member!.user!.id = '123456789012345678'
    payload.data!.options![0]!.options = [
      { name: 'code', type: 3, value: 'ABCD-EFGH' },
    ]

    const response = await handleSlashCommand(payload)

    expect(mocks.approveDiscordBrowserAuthAttempt).toHaveBeenCalledWith({
      guildId: 'tenant-1',
      approvalCode: 'ABCD-EFGH',
      discordId: '123456789012345678',
    })
    expect(response.data?.content).toContain('approved')
    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
  })

  it('shows member-focused /agm help without admin commands', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')

    const response = await handleSlashCommand(agmPayload('help', { guild_id: undefined }))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('/agm me verify')
    expect(response.data?.content).toContain('/agm wallet balance')
    expect(response.data?.content).toContain('/agm event next')
    expect(response.data?.content).toContain('`pickup`')
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

  it('points unlinked guilds to help and admin setup', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')

    const response = await handleSlashCommand(agmGroupedPayload('wallet', 'balance'))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('/agm help')
    expect(response.data?.content).toContain('/agm setup')
    expect(response.data?.content).toContain('https://albion-guildmanager.com/faq')
  })

  it('routes /agm me verify through Discord reauth before Albion onboarding', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()

    const response = await handleSlashCommand(agmGroupedPayload('me', 'verify'))

    expectMagicLinkDeliveredOnlyByButton(response)
    expect(response.data?.content).toContain('Albion verification')
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
    expect(mocks.rpc).toHaveBeenCalledWith('submit_exchange_request', {
      p_guild_id: 'tenant-1',
      p_discord_id: 'member-1',
      p_username: 'Member One',
      p_silver: 1500,
    })
  })

  it('creates a self-service exchange request and sends an admin notification', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()

    const response = await handleSlashCommand(agmWithdrawPayload({ amount: 1500 }))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('withdrawal request created')
    expect(response.data?.content).toContain('Amount: 1,500p')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/me/wallet',
    )
    expect(mocks.rpc).toHaveBeenCalledWith('submit_exchange_request', {
      p_guild_id: 'tenant-1',
      p_discord_id: 'member-1',
      p_username: 'Member One',
      p_silver: 1500,
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

  it('rejects wallet withdrawal when spendable points are insufficient', async () => {
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
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'submit_exchange_request',
      expect.anything(),
    )
    expect(mocks.sendAdminNotification).not.toHaveBeenCalled()
  })

  it('rejects wallet withdrawal until the invoking member is Albion verified', async () => {
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
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      'submit_exchange_request',
      expect.anything(),
    )
  })

  it('maps duplicate pending exchange requests to the wallet withdrawal response', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: 'P0001', message: 'PENDING_EXCHANGE_EXISTS' },
    })

    const response = await handleSlashCommand(agmWithdrawPayload({ amount: 1500 }))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('pending withdrawal request')
    expect(response.data?.content).toContain('/agm wallet history')
    expect(response.data?.content).toContain(
      'https://menhera.albion-guildmanager.com/me/wallet',
    )
  })

  it('maps a temporary member exchange restriction to the wallet withdrawal response', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'P0001',
        message: 'EXCHANGE_TEMPORARILY_RESTRICTED:2026-07-29T00:00:00Z',
      },
    })

    const response = await handleSlashCommand(agmWithdrawPayload({ amount: 1500 }))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('temporarily restricted withdrawal requests')
    expect(mocks.sendAdminNotification).not.toHaveBeenCalled()
  })

  it('maps the five-day gameplay-video requirement to the wallet withdrawal response', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: {
        code: 'P0001',
        message: 'EXCHANGE_RECENT_GAMEPLAY_VIDEO_REQUIRED',
      },
    })

    const response = await handleSlashCommand(agmWithdrawPayload({ amount: 1500 }))

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(response.data?.content).toContain('gameplay video from the preceding five days')
    expect(response.data?.content).toContain('/me/content-compliance')
    expect(mocks.sendAdminNotification).not.toHaveBeenCalled()
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

  it('issues a one-time tenant link only after a signed Discord component interaction', async () => {
    mockTenant()
    mocks.parseDiscordAppLoginCustomId.mockReturnValue({ destination: 'wallet' })

    const response = await handleDiscordAppLoginInteraction({
      id: 'interaction-1',
      type: 3,
      guild_id: 'discord-guild-1',
      data: { custom_id: 'agm_login:v1:wallet' },
      member: {
        user: { id: 'member-1', username: 'member' },
        roles: [],
      },
    })

    expect(mocks.createDiscordAppLoginLink).toHaveBeenCalledWith({
      guildId: 'tenant-1',
      tenantSlug: 'menhera',
      discordId: 'member-1',
      returnTo: '/me/wallet',
    })
    expectMagicLinkDeliveredOnlyByButton(response)
  })

  it('blocks /agm admin dashboard when the caller is not a site admin', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()
    mocks.overrideMaybeSingle.mockResolvedValueOnce({ data: null })

    const response = await handleSlashCommand(
      agmGroupedPayload('admin', 'dashboard', [], {
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

    expectMagicLinkDeliveredOnlyByButton(response)
    expect(response.data?.content).toContain('admin dashboard')
  })

  it('allows /agm admin for tenant owners and explicit site admin overrides', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant({ createdByDiscordId: 'owner-1' })

    const ownerResponse = await handleSlashCommand(
      agmGroupedPayload('admin', 'dashboard', [], {
        member: {
          user: { id: 'owner-1', username: 'owner' },
          roles: [],
        },
      }),
    )
    expectMagicLinkDeliveredOnlyByButton(ownerResponse)
    expect(mocks.overrideMaybeSingle).not.toHaveBeenCalled()

    mockTenant({ createdByDiscordId: 'owner-1' })
    mocks.overrideMaybeSingle.mockResolvedValueOnce({ data: { discord_id: 'override-1' } })

    const overrideResponse = await handleSlashCommand(
      agmGroupedPayload('admin', 'dashboard', [], {
        member: {
          user: { id: 'override-1', username: 'override' },
          roles: [],
        },
      }),
    )
    expectMagicLinkDeliveredOnlyByButton(overrideResponse)
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
        content: null,
        embeds: [],
        flags: 1 << 15,
        allowed_mentions: { parse: [] },
        components: expect.any(Array),
      }),
    )
    const sentCall = mocks.sendDiscordChannelMessage.mock.calls[0] as unknown as [
      string,
      {
        components?: unknown[]
      },
    ] | undefined
    const payload = sentCall?.[1] as {
      components?: unknown[]
    } | undefined
    expect(payload).toBeDefined()
    const serialized = JSON.stringify(payload)
    expect(serialized).toContain('## Menhera Member Center')
    expect(serialized).toContain('Join events')
    expect(serialized).toContain('agm_member:v1:event')
    expect(serialized).toContain('agm_member:v1:exchange')
    expect(serialized).toContain('agm_member:v1:regear')
    expect(serialized).toContain('agm_login:v1:me')
    expect(serialized).not.toContain('/discord/open?')
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

  it('uses the guild locale for the public panel and the invoker locale for its reply', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant({ adminRoleIds: ['admin-role'] })

    const response = await handleSlashCommand(
      agmGroupedPayload('admin', 'quick-publish', [], {
        channel_id: 'channel-1',
        locale: 'ja',
        guild_locale: 'ko',
        member: {
          user: { id: 'admin-1', username: 'admin' },
          roles: ['admin-role'],
        },
      }),
    )

    const sentCall = mocks.sendDiscordChannelMessage.mock.calls[0] as unknown as [string, object]
    const serialized = JSON.stringify(sentCall[1])
    expect(serialized).toContain('Discord 로그인/세션 갱신')
    expect(serialized).toContain('이벤트 참가')
    expect(serialized).toContain('환전 신청')
    expect(serialized).toContain('리기어 신청')
    expect(response.data?.content).toContain('メンバーガイドパネル')
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
        content: null,
        embeds: [],
        flags: 1 << 15,
        allowed_mentions: { parse: [] },
        components: [expect.objectContaining({
          type: 17,
          components: expect.arrayContaining([
            { type: 10, content: '## Menhera Member Guide' },
            { type: 10, content: 'Pinned guide for Menhera.' },
          ]),
        })],
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
      new DiscordChannelMessageError(404, 10008, 'Unknown Message', ''),
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
      agmGroupedPayload('admin', 'quick-publish', [
        {
          name: 'message',
          type: 3,
          value: 'Welcome to {name}.\nPick your next step below.',
        },
      ], {
        channel_id: 'channel-1',
        member: {
          user: { id: 'admin-1', username: 'admin' },
          roles: ['admin-role'],
        },
      }),
    )

    expect(response.data?.flags).toBe(MESSAGE_FLAG_EPHEMERAL)
    expect(mocks.sendDiscordChannelMessage).toHaveBeenCalledWith(
      'channel-1',
      expect.objectContaining({
        content: null,
        embeds: [],
        flags: 1 << 15,
        allowed_mentions: { parse: [] },
        components: [expect.objectContaining({
          type: 17,
          components: expect.arrayContaining([
            { type: 10, content: '## Menhera Member Center' },
            { type: 10, content: 'Welcome to Menhera.\nPick your next step below.' },
          ]),
        })],
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

  it('blocks /agm admin quick-publish when the caller is not a site admin', async () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')
    mockTenant()
    mocks.overrideMaybeSingle.mockResolvedValueOnce({ data: null })

    const response = await handleSlashCommand(
      agmGroupedPayload('admin', 'quick-publish', [], {
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

  it('blocks /agm admin points when the caller is not a site admin', async () => {
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

  it('allows /agm admin points and writes a tenant-scoped ledger adjustment', async () => {
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

  it('accepts the explicit grouped /agm admin points payload', async () => {
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

  it('rejects /agm admin points when the target is not a linked guild member', async () => {
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

})
