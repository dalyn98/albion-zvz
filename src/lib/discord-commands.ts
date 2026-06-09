// Discord 슬래시 커맨드 핸들러 — interactions endpoint 가 라우팅한 뒤 호출.
//
// Slash command:
//   /agm <destination> — 사이트 기능으로 이동하는 단일 네비게이션 명령어.
//
// 대부분의 Discord 명령어는 정확한 진입점 링크만 ephemeral 로 돌려준다. 예외적으로
// `/agm points` 는 site admin 전용 수동 포인트 조정이며, 웹 UI 와 같은
// point_ledger append-only 경로를 사용한다.

import { getAdminClient } from '@/lib/supabase-admin'
import { getDiscordGuild, sendDiscordChannelMessage } from '@/lib/discord'
import { buildDiscordStartHref } from '@/lib/discord-auth-url'
import { tenantUrl } from '@/lib/tenant-resolver'
import { isValidTenantSlug } from '@/lib/tenant-slug'
import { isLocale, type Locale } from '@/i18n/locales'
import { killbotDashboardUrl } from '@/lib/killbot'
import {
  buildDiscordQuickStarterComponents,
  type DiscordQuickStarterButtonLabels,
} from '@/lib/discord-quick-starter'
import { log } from '@/lib/log'
import { logTenantOnboardingEvent } from '@/lib/tenant-onboarding-events'
import { SLOT_ROLES } from '@/types'
import {
  ADMIN_POINT_ADJUSTMENT_MEMO_MAX_LENGTH,
  POINT_LEDGER_DELTA_ABS_MAX,
  applyAdminPointAdjustment,
  type AdminPointAdjustmentFailure,
} from '@/lib/admin-point-adjustments'
import {
  ephemeralReply,
  type DiscordInteractionPayload,
  type DiscordInteractionResponse,
  type DiscordInteractionOption,
} from '@/lib/discord-interactions'

export const COMMAND_AGM = 'agm'
export const DEFAULT_DISCORD_COMMAND_LOCALE = 'en' satisfies Locale
const DISCORD_OPTION_TYPE_USER = 6
const DISCORD_OPTION_TYPE_INTEGER = 4
const DISCORD_OPTION_TYPE_STRING = 3
const DISCORD_PERMISSION_ADMINISTRATOR = 1n << 3n
const DISCORD_PERMISSION_MANAGE_GUILD = 1n << 5n
const MAX_SETUP_SLUG_ATTEMPTS = 5

export const AGM_SUBCOMMANDS = [
  'setup',
  'quick',
  'publish-quick',
  'home',
  'me',
  'verify',
  'events',
  'regear',
  'shop',
  'craft',
  'wallet',
  'admin',
  'points',
  'guide',
  'killbot',
] as const

export type AgmSubcommand = typeof AGM_SUBCOMMANDS[number]

export const ALL_COMMAND_NAMES = [COMMAND_AGM] as const
const ADMIN_ONLY_AGM_SUBCOMMANDS = ['admin', 'points', 'killbot'] as const satisfies readonly AgmSubcommand[]
const ADMIN_ONLY_PUBLISH_SUBCOMMANDS = ['publish-quick'] as const satisfies readonly AgmSubcommand[]

export interface DiscordBotMessages {
  unsupportedInteraction: string
  handlerFailed: string
  notInGuild: string
  guildNotLinked: string
  adminOnly: string
  unknownCommand: string
  setupActive: string
  setupResume: string
  setupCreated: string
  setupManageGuildRequired: string
  setupOriginalInstallerOnly: string
  quickReady: string
  quickPublicPanel: string
  quickPublished: string
  quickPublishChannelMissing: string
  quickButtonVerify: string
  quickButtonEvents: string
  quickButtonMe: string
  quickButtonRegear: string
  quickButtonShop: string
  quickButtonWallet: string
  quickButtonCraft: string
  quickButtonGuide: string
  guideReady: string
  homeReady: string
  meReady: string
  verifyReady: string
  eventsReady: string
  eventsNextBlock: string
  regearReady: string
  shopReady: string
  craftReady: string
  walletReady: string
  adminReady: string
  pointsTargetRequired: string
  pointsInvalidAmount: string
  pointsMemoRequired: string
  pointsMemoTooLong: string
  pointsMemberNotFound: string
  pointsReady: string
  killbotReady: string
}

// next-intl 의 messages JSON 에서 discordBot 네임스페이스만 꺼내 평탄화.
// getTranslations 는 RSC request-context 가 필요해 interactions API 에서 못
// 쓴다. 대신 빌드 타임에 같이 번들된 src/messages/{locale}.json 을 동적
// import 해서 평문 string 만 꺼낸다.
export async function loadDiscordBotMessages(
  locale: Locale = DEFAULT_DISCORD_COMMAND_LOCALE,
): Promise<DiscordBotMessages> {
  const dict = (await import(`../messages/${locale}.json`)).default as Record<string, unknown>
  const ns = (dict.discordBot ?? {}) as Record<string, string>
  return {
    unsupportedInteraction: ns.unsupportedInteraction ?? '',
    handlerFailed: ns.handlerFailed ?? '',
    notInGuild: ns.notInGuild ?? '',
    guildNotLinked: ns.guildNotLinked ?? '',
    adminOnly: ns.adminOnly ?? '',
    unknownCommand: ns.unknownCommand ?? '',
    setupActive: ns.setupActive ?? '',
    setupResume: ns.setupResume ?? '',
    setupCreated: ns.setupCreated ?? '',
    setupManageGuildRequired: ns.setupManageGuildRequired ?? '',
    setupOriginalInstallerOnly: ns.setupOriginalInstallerOnly ?? '',
    quickReady: ns.quickReady ?? '',
    quickPublicPanel: ns.quickPublicPanel ?? '',
    quickPublished: ns.quickPublished ?? '',
    quickPublishChannelMissing: ns.quickPublishChannelMissing ?? '',
    quickButtonVerify: ns.quickButtonVerify ?? '',
    quickButtonEvents: ns.quickButtonEvents ?? '',
    quickButtonMe: ns.quickButtonMe ?? '',
    quickButtonRegear: ns.quickButtonRegear ?? '',
    quickButtonShop: ns.quickButtonShop ?? '',
    quickButtonWallet: ns.quickButtonWallet ?? '',
    quickButtonCraft: ns.quickButtonCraft ?? '',
    quickButtonGuide: ns.quickButtonGuide ?? '',
    guideReady: ns.guideReady ?? '',
    homeReady: ns.homeReady ?? '',
    meReady: ns.meReady ?? '',
    verifyReady: ns.verifyReady ?? '',
    eventsReady: ns.eventsReady ?? '',
    eventsNextBlock: ns.eventsNextBlock ?? '',
    regearReady: ns.regearReady ?? '',
    shopReady: ns.shopReady ?? '',
    craftReady: ns.craftReady ?? '',
    walletReady: ns.walletReady ?? '',
    adminReady: ns.adminReady ?? '',
    pointsTargetRequired: ns.pointsTargetRequired ?? '',
    pointsInvalidAmount: ns.pointsInvalidAmount ?? '',
    pointsMemoRequired: ns.pointsMemoRequired ?? '',
    pointsMemoTooLong: ns.pointsMemoTooLong ?? '',
    pointsMemberNotFound: ns.pointsMemberNotFound ?? '',
    pointsReady: ns.pointsReady ?? '',
    killbotReady: ns.killbotReady ?? '',
  }
}

function format(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`)
}

interface TenantBindResult {
  id: string
  slug: string
  name: string
  createdByDiscordId: string | null
  adminRoleIds: string[]
}

interface SetupTenantBindResult extends TenantBindResult {
  status: string
}

// Discord guild_id 로 active tenant 를 찾는다. status 가 active 가 아닌
// (suspended/onboarding) 길드는 미연동과 동일하게 취급 — 공식 가이드로 폴백.
async function findTenantByDiscordGuild(
  discordGuildId: string,
): Promise<TenantBindResult | null> {
  const db = getAdminClient()
  const { data } = await db
    .from('tenants')
    .select('id, slug, name, created_by_discord_id, admin_role_ids')
    .eq('discord_guild_id', discordGuildId)
    .eq('status', 'active')
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id as string,
    slug: data.slug as string,
    name: data.name as string,
    createdByDiscordId: (data.created_by_discord_id as string | null) ?? null,
    adminRoleIds: (data.admin_role_ids as string[] | null) ?? [],
  }
}

async function findSetupTenantByDiscordGuild(
  discordGuildId: string,
): Promise<SetupTenantBindResult | null> {
  const db = getAdminClient()
  const { data } = await db
    .from('tenants')
    .select('id, slug, name, status, created_by_discord_id, admin_role_ids')
    .eq('discord_guild_id', discordGuildId)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id as string,
    slug: data.slug as string,
    name: data.name as string,
    status: (data.status as string | null) ?? 'pending',
    createdByDiscordId: (data.created_by_discord_id as string | null) ?? null,
    adminRoleIds: (data.admin_role_ids as string[] | null) ?? [],
  }
}

function getInvokerDiscordId(payload: DiscordInteractionPayload): string | null {
  return payload.member?.user?.id ?? payload.user?.id ?? null
}

async function findPreferredCommandLocale(
  guildId: string,
  discordId: string,
): Promise<Locale | null> {
  const db = getAdminClient()

  try {
    const { data: member } = await db
      .from('guild_avatars')
      .select('preferred_language')
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
      .maybeSingle()
    if (isLocale(member?.preferred_language)) return member.preferred_language

    const { data: guest } = await db
      .from('guests')
      .select('preferred_language')
      .eq('guild_id', guildId)
      .eq('discord_id', discordId)
      .maybeSingle()
    return isLocale(guest?.preferred_language) ? guest.preferred_language : null
  } catch {
    return null
  }
}

// Discord 명령 응답은 사이트의 저장된 언어 설정을 우선한다. 아직 설정이
// 없거나 테넌트/사용자를 특정할 수 없으면 영어로 고정한다.
export async function resolveDiscordCommandLocale(
  payload: DiscordInteractionPayload,
  guildId: string | null | undefined,
): Promise<Locale> {
  const discordId = getInvokerDiscordId(payload)
  if (guildId && discordId) {
    const preferred = await findPreferredCommandLocale(guildId, discordId)
    if (preferred) return preferred
  }
  return DEFAULT_DISCORD_COMMAND_LOCALE
}

function isAdminOnlySubcommand(destination: AgmSubcommand): boolean {
  return (ADMIN_ONLY_AGM_SUBCOMMANDS as readonly string[]).includes(destination)
}

function isPublishSubcommand(destination: AgmSubcommand): boolean {
  return (ADMIN_ONLY_PUBLISH_SUBCOMMANDS as readonly string[]).includes(destination)
}

function canManageDiscordGuild(payload: DiscordInteractionPayload): boolean {
  const raw = payload.member?.permissions
  if (!raw) return false
  try {
    const permissions = BigInt(raw)
    return (
      (permissions & DISCORD_PERMISSION_ADMINISTRATOR) === DISCORD_PERMISSION_ADMINISTRATOR ||
      (permissions & DISCORD_PERMISSION_MANAGE_GUILD) === DISCORD_PERMISSION_MANAGE_GUILD
    )
  } catch {
    return false
  }
}

async function isSiteAdminForTenant(
  tenant: TenantBindResult,
  payload: DiscordInteractionPayload,
): Promise<boolean> {
  const discordId = getInvokerDiscordId(payload)
  if (!discordId) return false
  if (tenant.createdByDiscordId === discordId) return true

  const memberRoles = payload.member?.roles ?? []
  if (tenant.adminRoleIds.some((roleId) => memberRoles.includes(roleId))) return true

  const db = getAdminClient()
  const { data } = await db
    .from('tenant_admin_overrides')
    .select('discord_id')
    .eq('tenant_id', tenant.id)
    .eq('discord_id', discordId)
    .maybeSingle()
  return !!data
}

interface UpcomingEventResult {
  id: string
  title: string
  gatherAt: string | null
}

// 길드의 가장 임박한 미래 이벤트 1 건. /agm events 는 이벤트 목록을 주 링크로
// 주되, 바로 들어갈 수 있는 다음 이벤트가 있으면 보조 링크로 덧붙인다.
async function findUpcomingEvent(guildId: string): Promise<UpcomingEventResult | null> {
  const db = getAdminClient()
  const nowIso = new Date().toISOString()
  const { data } = await db
    .from('events')
    .select('id, title, gather_at')
    .eq('guild_id', guildId)
    .eq('status', 'published')
    .is('battle_started_at', null)
    .gte('gather_at', nowIso)
    .order('gather_at', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id as string,
    title: data.title as string,
    gatherAt: (data.gather_at as string | null) ?? null,
  }
}

// 이벤트 시간 표시는 디스코드 native timestamp markup `<t:UNIX:F>` 를 쓴다.
// 클라이언트 측에서 자동으로 사용자 timezone + locale 로 변환해 주므로
// 서버는 timezone 계산을 안 해도 된다.
function formatGatherTimestamp(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return iso
  const unix = Math.floor(dt.getTime() / 1000)
  return `<t:${unix}:F>`
}

function getAgmSubcommandName(payload: DiscordInteractionPayload): AgmSubcommand | null {
  const name = payload.data?.options?.[0]?.name
  return AGM_SUBCOMMANDS.includes(name as AgmSubcommand) ? (name as AgmSubcommand) : null
}

function getAgmSubcommandOptions(payload: DiscordInteractionPayload): DiscordInteractionOption[] {
  return payload.data?.options?.[0]?.options ?? []
}

function getOption(
  options: readonly DiscordInteractionOption[],
  name: string,
): DiscordInteractionOption | null {
  return options.find((option) => option.name === name) ?? null
}

function getInvokerDisplayName(payload: DiscordInteractionPayload): string | null {
  return (
    payload.member?.nick?.trim() ||
    payload.member?.user?.global_name?.trim() ||
    payload.member?.user?.username?.trim() ||
    payload.user?.global_name?.trim() ||
    payload.user?.username?.trim() ||
    null
  )
}

function getTargetDisplayName(
  payload: DiscordInteractionPayload,
  targetDiscordId: string,
  fallback: string | null,
): string {
  const resolvedMember = payload.data?.resolved?.members?.[targetDiscordId]
  const resolvedUser = payload.data?.resolved?.users?.[targetDiscordId]
  return (
    resolvedMember?.nick?.trim() ||
    resolvedUser?.global_name?.trim() ||
    resolvedUser?.username?.trim() ||
    fallback?.trim() ||
    `<@${targetDiscordId}>`
  )
}

function formatSignedPoints(delta: number): string {
  const sign = delta > 0 ? '+' : '-'
  return `${sign}${Math.abs(delta).toLocaleString('en-US')}`
}

function pointAdjustmentErrorMessage(
  error: AdminPointAdjustmentFailure,
  messages: DiscordBotMessages,
): string {
  switch (error.code) {
    case 'invalid_delta':
      return format(messages.pointsInvalidAmount, {
        max: POINT_LEDGER_DELTA_ABS_MAX.toLocaleString('en-US'),
      })
    case 'memo_required':
      return messages.pointsMemoRequired
    case 'memo_too_long':
      return format(messages.pointsMemoTooLong, {
        max: String(ADMIN_POINT_ADJUSTMENT_MEMO_MAX_LENGTH),
      })
    case 'member_not_found':
      return messages.pointsMemberNotFound
    case 'db_error':
      return messages.handlerFailed
  }
}

export async function handleSlashCommand(
  payload: DiscordInteractionPayload,
): Promise<DiscordInteractionResponse> {
  const tenant = payload.guild_id ? await findTenantByDiscordGuild(payload.guild_id) : null
  const messages = await loadDiscordBotMessages(
    await resolveDiscordCommandLocale(payload, tenant?.id),
  )

  if (payload.data?.name !== COMMAND_AGM) {
    return ephemeralReply(messages.unknownCommand)
  }

  const destination = getAgmSubcommandName(payload)
  if (!destination || destination === 'guide') {
    return handleGuide(messages)
  }

  // DM 등 길드 컨텍스트 없는 호출은 길드별 링크를 만들 수 없으므로 안내만.
  if (!payload.guild_id) {
    return ephemeralReply(messages.notInGuild)
  }

  if (destination === 'setup') {
    return handleSetup(payload, tenant, messages)
  }

  if (!tenant) {
    const docsUrl = tenantUrl(null, '/faq')
    return ephemeralReply(format(messages.guildNotLinked, { docsUrl }))
  }

  if (isPublishSubcommand(destination) && !(await isSiteAdminForTenant(tenant, payload))) {
    return ephemeralReply(messages.adminOnly)
  }

  if (destination === 'publish-quick') {
    return handlePublishQuickStarter(tenant, payload, messages)
  }

  if (isAdminOnlySubcommand(destination) && !(await isSiteAdminForTenant(tenant, payload))) {
    return ephemeralReply(messages.adminOnly)
  }

  if (destination === 'killbot') {
    return handleKillbot(tenant, messages)
  }

  if (destination === 'points') {
    return handlePointsAdjustment(tenant, payload, messages)
  }

  switch (destination) {
    case 'quick':
      return handleQuickStarter(tenant, payload, messages)
    case 'home':
      return replyWithTenantLink(messages.homeReady, tenant, '/')
    case 'me':
      return replyWithTenantLink(messages.meReady, tenant, '/me')
    case 'verify':
      return replyWithTenantLink(
        messages.verifyReady,
        tenant,
        buildDiscordStartHref({
          returnTo: '/onboarding/albion',
          forceConsent: true,
        }),
      )
    case 'events':
      return handleEvents(tenant, messages)
    case 'regear':
      return replyWithTenantLink(messages.regearReady, tenant, '/regear')
    case 'shop':
      return replyWithTenantLink(messages.shopReady, tenant, '/shop')
    case 'craft':
      return replyWithTenantLink(messages.craftReady, tenant, '/craft/queue')
    case 'wallet':
      return replyWithTenantLink(messages.walletReady, tenant, '/me/wallet')
    case 'admin':
      return replyWithTenantLink(messages.adminReady, tenant, '/admin/dashboard')
  }
}

function quickStarterButtonLabels(messages: DiscordBotMessages): DiscordQuickStarterButtonLabels {
  return {
    verify: messages.quickButtonVerify,
    events: messages.quickButtonEvents,
    me: messages.quickButtonMe,
    regear: messages.quickButtonRegear,
    shop: messages.quickButtonShop,
    wallet: messages.quickButtonWallet,
    craft: messages.quickButtonCraft,
    guide: messages.quickButtonGuide,
  }
}

function handleQuickStarter(
  tenant: TenantBindResult,
  payload: DiscordInteractionPayload,
  messages: DiscordBotMessages,
): DiscordInteractionResponse {
  if (!payload.guild_id) return ephemeralReply(messages.notInGuild)
  return ephemeralReply(
    format(messages.quickReady, { name: tenant.name }),
    {
      components: buildDiscordQuickStarterComponents({
        discordGuildId: payload.guild_id,
        labels: quickStarterButtonLabels(messages),
      }),
    },
  )
}

async function handlePublishQuickStarter(
  tenant: TenantBindResult,
  payload: DiscordInteractionPayload,
  messages: DiscordBotMessages,
): Promise<DiscordInteractionResponse> {
  if (!payload.guild_id) return ephemeralReply(messages.notInGuild)
  if (!payload.channel_id) return ephemeralReply(messages.quickPublishChannelMissing)

  try {
    await sendDiscordChannelMessage(payload.channel_id, {
      content: format(messages.quickPublicPanel, { name: tenant.name }),
      allowed_mentions: { parse: [] },
      components: buildDiscordQuickStarterComponents({
        discordGuildId: payload.guild_id,
        labels: quickStarterButtonLabels(messages),
      }),
    })
  } catch (error) {
    log.error('[discord-commands] publish quick starter failed', error, {
      tenant_id: tenant.id,
      discord_guild_id: payload.guild_id,
      channel_id: payload.channel_id,
    })
    return ephemeralReply(messages.handlerFailed)
  }

  return ephemeralReply(format(messages.quickPublished, { name: tenant.name }))
}

async function handleSetup(
  payload: DiscordInteractionPayload,
  activeTenant: TenantBindResult | null,
  messages: DiscordBotMessages,
): Promise<DiscordInteractionResponse> {
  if (!payload.guild_id) return ephemeralReply(messages.notInGuild)
  if (activeTenant) {
    return ephemeralReply(
      format(messages.setupActive, {
        name: activeTenant.name,
        url: tenantCommandUrl(activeTenant, '/admin/dashboard'),
      }),
    )
  }

  const discordId = getInvokerDiscordId(payload)
  const setupTenant = await findSetupTenantByDiscordGuild(payload.guild_id)
  if (setupTenant) {
    const isOriginalInstaller = !!discordId && setupTenant.createdByDiscordId === discordId
    if (!isOriginalInstaller) return ephemeralReply(messages.setupOriginalInstallerOnly)

    const setupUrl =
      setupTenant.status === 'active'
        ? tenantCommandUrl(setupTenant, '/admin/dashboard')
        : tenantUrl(null, `/onboard/setup/${setupTenant.id}`)
    return ephemeralReply(
      format(setupTenant.status === 'active' ? messages.setupActive : messages.setupResume, {
        name: setupTenant.name,
        url: setupUrl,
      }),
    )
  }

  if (!discordId || !canManageDiscordGuild(payload)) {
    return ephemeralReply(messages.setupManageGuildRequired)
  }

  const createdTenant = await createPendingSetupTenant({
    discordGuildId: payload.guild_id,
    installerDiscordId: discordId,
  })
  if (!createdTenant) return ephemeralReply(messages.handlerFailed)

  return ephemeralReply(
    format(messages.setupCreated, {
      name: createdTenant.name,
      url: tenantUrl(null, `/onboard/setup/${createdTenant.id}`),
    }),
  )
}

function slugifyDiscordGuildName(name: string): string {
  const suffix = Math.random().toString(36).slice(2, 6)
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  const candidate = base.length > 0 ? `${base}-${suffix}` : `guild-${suffix}`
  return isValidTenantSlug(candidate) ? candidate : `guild-${suffix}`
}

async function createPendingSetupTenant(input: {
  discordGuildId: string
  installerDiscordId: string
}): Promise<SetupTenantBindResult | null> {
  const guild = await getDiscordGuild(input.discordGuildId)
  if (!guild) {
    log.warn('[discord-commands] setup command could not load Discord guild', {
      discord_guild_id: input.discordGuildId,
    })
    return null
  }

  const db = getAdminClient()
  let tenantRow: { id: string; slug: string } | null = null
  let lastInsertError: unknown = null
  const now = new Date().toISOString()

  for (let attempt = 0; attempt < MAX_SETUP_SLUG_ATTEMPTS; attempt += 1) {
    const { data: inserted, error } = await db
      .from('tenants')
      .insert({
        discord_guild_id: input.discordGuildId,
        slug: slugifyDiscordGuildName(guild.name),
        name: guild.name,
        status: 'pending',
        bot_installed_at: now,
        created_by_discord_id: input.installerDiscordId,
      })
      .select('id, slug')
      .single()
    if (inserted && !error) {
      tenantRow = inserted as { id: string; slug: string }
      break
    }
    lastInsertError = error
    if ((error as { code?: string } | null)?.code !== '23505') break
  }

  if (!tenantRow) {
    log.error('[discord-commands] setup command tenant insert failed', lastInsertError, {
      discord_guild_id: input.discordGuildId,
      installer_discord_id: input.installerDiscordId,
    })
    return null
  }

  const seedRows = SLOT_ROLES.map((role_name) => ({
    guild_id: tenantRow.id,
    role_name,
    silver: 0,
    updated_at: now,
  }))
  const { error: seedError } = await db
    .from('role_rewards')
    .upsert(seedRows, { onConflict: 'guild_id,role_name' })
  if (seedError) {
    log.error('[discord-commands] setup command role_rewards seed failed', seedError, {
      tenant_id: tenantRow.id,
    })
  }

  await logTenantOnboardingEvent({
    guildId: tenantRow.id,
    actorDiscordId: input.installerDiscordId,
    eventType: 'bot_installed',
    details: {
      discordGuildId: input.discordGuildId,
      guildName: guild.name,
      createdTenant: true,
      source: 'discord_setup_command',
    },
  })

  return {
    id: tenantRow.id,
    slug: tenantRow.slug,
    name: guild.name,
    status: 'pending',
    createdByDiscordId: input.installerDiscordId,
    adminRoleIds: [],
  }
}

async function handlePointsAdjustment(
  tenant: TenantBindResult,
  payload: DiscordInteractionPayload,
  messages: DiscordBotMessages,
): Promise<DiscordInteractionResponse> {
  const adminDiscordId = getInvokerDiscordId(payload)
  if (!adminDiscordId) return ephemeralReply(messages.adminOnly)

  const options = getAgmSubcommandOptions(payload)
  const memberOption = getOption(options, 'member')
  const deltaOption = getOption(options, 'delta')
  const memoOption = getOption(options, 'memo')
  const targetDiscordId =
    memberOption?.type === DISCORD_OPTION_TYPE_USER && typeof memberOption.value === 'string'
      ? memberOption.value
      : null
  if (!targetDiscordId) return ephemeralReply(messages.pointsTargetRequired)

  const delta =
    deltaOption?.type === DISCORD_OPTION_TYPE_INTEGER && typeof deltaOption.value === 'number'
      ? deltaOption.value
      : Number.NaN
  const memo =
    memoOption?.type === DISCORD_OPTION_TYPE_STRING && typeof memoOption.value === 'string'
      ? memoOption.value
      : ''

  const db = getAdminClient()
  const result = await applyAdminPointAdjustment(db, {
    guildId: tenant.id,
    targetDiscordId,
    delta,
    memo,
    adminDiscordId,
    adminUsername: getInvokerDisplayName(payload),
    source: 'discord_command',
  })
  if (!result.ok) return ephemeralReply(pointAdjustmentErrorMessage(result, messages))

  return ephemeralReply(
    format(messages.pointsReady, {
      name: tenant.name,
      user: getTargetDisplayName(payload, targetDiscordId, result.targetUsername),
      delta: formatSignedPoints(result.delta),
      memo: result.memo,
      url: tenantCommandUrl(tenant, `/members/${targetDiscordId}`),
    }),
  )
}

function replyWithTenantLink(
  template: string,
  tenant: TenantBindResult,
  path: string,
): DiscordInteractionResponse {
  return ephemeralReply(
    format(template, {
      name: tenant.name,
      url: tenantCommandUrl(tenant, path),
    }),
  )
}

function tenantCommandUrl(tenant: TenantBindResult, path: string): string {
  const base = tenantUrl(tenant.slug, '/')
  try {
    return new URL(path, base.endsWith('/') ? base : `${base}/`).toString().replace(/\/$/, '')
  } catch {
    return tenantUrl(tenant.slug, path)
  }
}

function handleGuide(messages: DiscordBotMessages): DiscordInteractionResponse {
  return ephemeralReply(
    format(messages.guideReady, {
      guideUrl: tenantUrl(null, '/member-quick-guide.html'),
      docsUrl: tenantUrl(null, '/faq'),
    }),
  )
}

async function handleEvents(
  tenant: TenantBindResult,
  messages: DiscordBotMessages,
): Promise<DiscordInteractionResponse> {
  const event = await findUpcomingEvent(tenant.id)
  const nextBlock = event
    ? format(messages.eventsNextBlock, {
        title: event.title,
        when: event.gatherAt ? formatGatherTimestamp(event.gatherAt) : '-',
        eventUrl: tenantUrl(tenant.slug, `/events/${event.id}`),
      })
    : ''

  return ephemeralReply(
    format(messages.eventsReady, {
      name: tenant.name,
      url: tenantUrl(tenant.slug, '/events'),
      nextBlock,
    }),
  )
}

function handleKillbot(
  tenant: TenantBindResult | null,
  messages: DiscordBotMessages,
): DiscordInteractionResponse {
  return ephemeralReply(
    format(messages.killbotReady, {
      guideUrl: tenantUrl(null, '/killbotguild.html'),
      dashboardUrl: tenant ? killbotDashboardUrl(tenant.slug) : tenantUrl(null, '/onboard'),
    }),
  )
}
