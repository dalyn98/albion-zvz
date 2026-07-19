// Discord 슬래시 커맨드 핸들러 — interactions endpoint 가 라우팅한 뒤 호출.
//
// Slash command:
//   /agm open page:<destination> — 사이트 기능으로 이동.
//   /agm me|wallet|admin <action> — 멤버/지갑/관리자 작업.
//
// 대부분의 Discord 명령어는 정확한 진입점 링크만 ephemeral 로 돌려준다. 예외적으로
// `/agm admin points` 는 site admin 전용 수동 포인트 조정이며, 웹 UI 와 같은
// point_ledger append-only 경로를 사용한다. Legacy flat payload 는 Discord
// global command 전파 지연 동안만 계속 받아 같은 내부 action 으로 정규화한다.

import discordCommandCatalog from '@/lib/discord-command-catalog.json'
import { getAdminClient } from '@/lib/supabase-admin'
import { revalidateAppSettingsCache } from '@/lib/app-settings-invalidation'
import { revalidateTenantDirectoryCache } from '@/lib/tenant-cache'
import {
  DiscordChannelMessageError,
  getDiscordGuild,
  sendDiscordChannelMessage,
  updateDiscordChannelMessage,
} from '@/lib/discord'
import { getAlbionOnboardingGateState } from '@/lib/albion-identity'
import { sendAdminNotification } from '@/lib/admin-notifications'
import { tenantUrl } from '@/lib/tenant-resolver'
import { isValidTenantSlug } from '@/lib/tenant-slug'
import { type Locale } from '@/i18n/locales'
import { killbotDashboardUrl } from '@/lib/killbot'
import { getMemberSpendablePointBalance } from '@/lib/point-ledger'
import { isPostgresPositiveInt, POSTGRES_INT_MAX } from '@/lib/postgres-int'
import {
  buildDiscordQuickStarterComponents,
  buildDiscordQuickStarterMessagePayload,
  DEFAULT_DISCORD_QUICK_STARTER_PANEL_COLOR,
  DEFAULT_DISCORD_QUICK_STARTER_PANEL_DESCRIPTION,
  DEFAULT_DISCORD_QUICK_STARTER_PANEL_FOOTER,
  DEFAULT_DISCORD_QUICK_STARTER_PANEL_TITLE,
  QUICK_STARTER_PANEL_DESCRIPTION_MAX_LENGTH,
  type DiscordQuickStarterButtonLabels,
} from '@/lib/discord-quick-starter'
import {
  createDiscordAppLoginLink,
  discordAppLoginReturnPath,
  parseDiscordAppLoginCustomId,
} from '@/lib/discord-app-login'
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
  type DiscordMessageComponent,
  type DiscordInteractionPayload,
  type DiscordInteractionResponse,
  type DiscordInteractionOption,
} from '@/lib/discord-interactions'
import {
  buildDiscordEventSignupComponents,
  loadDiscordEventSignupMessages,
} from '@/lib/discord-event-signups'

export const COMMAND_AGM = 'agm'
export const DEFAULT_DISCORD_COMMAND_LOCALE = 'en' satisfies Locale
const DISCORD_OPTION_TYPE_SUBCOMMAND = 1
const DISCORD_OPTION_TYPE_SUBCOMMAND_GROUP = 2
const DISCORD_OPTION_TYPE_USER = 6
const DISCORD_OPTION_TYPE_INTEGER = 4
const DISCORD_OPTION_TYPE_STRING = 3
const DISCORD_PERMISSION_ADMINISTRATOR = 1n << 3n
const DISCORD_PERMISSION_MANAGE_GUILD = 1n << 5n
const MAX_SETUP_SLUG_ATTEMPTS = 5

export const AGM_SUBCOMMANDS = [
  'setup',
  'quick',
  'help',
  'publish-quick',
  'home',
  'me',
  'verify',
  'events',
  'regear',
  'shop',
  'craft',
  'wallet',
  'balance',
  'withdraw',
  'admin',
  'points',
  'guide',
  'killbot',
] as const

export type AgmSubcommand = typeof AGM_SUBCOMMANDS[number]

export const ALL_COMMAND_NAMES = [COMMAND_AGM] as const
const AGM_SUBCOMMAND_SET = new Set<string>(AGM_SUBCOMMANDS)
const GROUPED_AGM_SUBCOMMANDS = {
  me: {
    profile: 'me',
    verify: 'verify',
  },
  wallet: {
    open: 'wallet',
    balance: 'balance',
    withdraw: 'withdraw',
  },
  admin: {
    dashboard: 'admin',
    points: 'points',
    'quick-publish': 'publish-quick',
    killbot: 'killbot',
  },
} as const satisfies Record<string, Record<string, AgmSubcommand>>
const ADMIN_ONLY_AGM_SUBCOMMANDS = ['admin', 'points', 'killbot'] as const satisfies readonly AgmSubcommand[]
const ADMIN_ONLY_PUBLISH_SUBCOMMANDS = ['publish-quick'] as const satisfies readonly AgmSubcommand[]
const QUICK_STARTER_PANEL_SETTING_KEYS = {
  legacyMessage: 'quick_starter_panel_message',
  title: 'quick_starter_panel_title',
  description: 'quick_starter_panel_description',
  color: 'quick_starter_panel_color',
  footer: 'quick_starter_panel_footer',
  channelId: 'quick_starter_panel_channel_id',
  messageId: 'quick_starter_panel_message_id',
  messageChannelId: 'quick_starter_panel_message_channel_id',
  publishedAt: 'quick_starter_panel_published_at',
} as const
const QUICK_STARTER_PANEL_SETTING_KEY_LIST = Object.values(QUICK_STARTER_PANEL_SETTING_KEYS)
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

type QuickStarterPanelSettingKey =
  (typeof QUICK_STARTER_PANEL_SETTING_KEYS)[keyof typeof QUICK_STARTER_PANEL_SETTING_KEYS]

interface QuickStarterPanelState {
  title: string
  description: string
  color: string
  footer: string
  messageId: string
  messageChannelId: string
}

interface DiscordCommandCatalogChoice {
  value: string
}

interface DiscordCommandCatalogOption {
  name: string
  options?: DiscordCommandCatalogOption[]
  choices?: DiscordCommandCatalogChoice[]
}

interface DiscordCommandCatalogDefinition {
  options: DiscordCommandCatalogOption[]
}

const [AGM_COMMAND_DEFINITION] =
  discordCommandCatalog as readonly DiscordCommandCatalogDefinition[]
const OPEN_PAGE_DESTINATIONS = new Set<string>(
  AGM_COMMAND_DEFINITION.options
    .find((option) => option.name === 'open')
    ?.options?.find((option) => option.name === 'page')
    ?.choices?.map((choice) => choice.value) ?? [],
)

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
  quickButtonLogin: string
  quickButtonVerify: string
  quickButtonEvents: string
  quickButtonMe: string
  quickButtonRegear: string
  quickButtonShop: string
  quickButtonWallet: string
  quickButtonCraft: string
  quickButtonGuide: string
  appLoginReady: string
  appLoginOpenHint: string
  appLoginOpenButton: string
  helpReady: string
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
  balanceMemberNotFound: string
  balanceReady: string
  withdrawInvalidAmount: string
  withdrawMemberNotFound: string
  withdrawAlbionVerificationRequired: string
  withdrawInsufficientBalance: string
  withdrawPendingExists: string
  withdrawReady: string
  withdrawAdminNotifyTitle: string
  withdrawAdminNotifyBody: string
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
    quickButtonLogin: ns.quickButtonLogin ?? '',
    quickButtonVerify: ns.quickButtonVerify ?? '',
    quickButtonEvents: ns.quickButtonEvents ?? '',
    quickButtonMe: ns.quickButtonMe ?? '',
    quickButtonRegear: ns.quickButtonRegear ?? '',
    quickButtonShop: ns.quickButtonShop ?? '',
    quickButtonWallet: ns.quickButtonWallet ?? '',
    quickButtonCraft: ns.quickButtonCraft ?? '',
    quickButtonGuide: ns.quickButtonGuide ?? '',
    appLoginReady: ns.appLoginReady ?? '',
    appLoginOpenHint: ns.appLoginOpenHint ?? '',
    appLoginOpenButton: ns.appLoginOpenButton ?? '',
    helpReady: ns.helpReady ?? '',
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
    balanceMemberNotFound: ns.balanceMemberNotFound ?? '',
    balanceReady: ns.balanceReady ?? '',
    withdrawInvalidAmount: ns.withdrawInvalidAmount ?? '',
    withdrawMemberNotFound: ns.withdrawMemberNotFound ?? '',
    withdrawAlbionVerificationRequired: ns.withdrawAlbionVerificationRequired ?? '',
    withdrawInsufficientBalance: ns.withdrawInsufficientBalance ?? '',
    withdrawPendingExists: ns.withdrawPendingExists ?? '',
    withdrawReady: ns.withdrawReady ?? '',
    withdrawAdminNotifyTitle: ns.withdrawAdminNotifyTitle ?? '',
    withdrawAdminNotifyBody: ns.withdrawAdminNotifyBody ?? '',
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

// Discord 명령 응답은 Discord 서버의 공용 채널에서 읽히므로 사이트 저장 언어와
// Discord client locale 을 보지 않고 영어로 고정한다.
export function resolveDiscordCommandLocale(): Locale {
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

type ActiveGuildMemberResult = {
  ok: true
  member: {
    discordId: string
    username: string | null
  } | null
} | {
  ok: false
  error: string
}

// 길드의 가장 임박한 미래 이벤트 1 건. /agm events 는 이벤트 목록을 주 링크로
// 주되, 바로 들어갈 수 있는 다음 이벤트가 있으면 보조 링크로 덧붙인다.
async function findUpcomingEvent(guildId: string): Promise<UpcomingEventResult | null> {
  const db = getAdminClient()
  const nowIso = new Date().toISOString()
  const { data, error } = await db
    .from('events')
    .select('id, title, gather_at')
    .eq('guild_id', guildId)
    .eq('status', 'published')
    .is('battle_started_at', null)
    .gte('gather_at', nowIso)
    .order('gather_at', { ascending: true, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (error) {
    log.warn('[discord-commands] upcoming event lookup failed', {
      guild_id: guildId,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
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

interface ParsedAgmCommand {
  destination: AgmSubcommand | null
  options: DiscordInteractionOption[]
}

function isAgmSubcommand(name: string | undefined): name is AgmSubcommand {
  return typeof name === 'string' && AGM_SUBCOMMAND_SET.has(name)
}

function getFirstSubcommandOption(
  option: DiscordInteractionOption,
): DiscordInteractionOption | null {
  return option.options?.find((child) => child.type === DISCORD_OPTION_TYPE_SUBCOMMAND) ?? null
}

function parseGroupedAgmCommand(group: DiscordInteractionOption): ParsedAgmCommand {
  if (group.type !== DISCORD_OPTION_TYPE_SUBCOMMAND_GROUP) {
    return { destination: null, options: [] }
  }

  const subcommand = getFirstSubcommandOption(group)
  if (!subcommand) return { destination: null, options: [] }

  const groupMap = GROUPED_AGM_SUBCOMMANDS[group.name as keyof typeof GROUPED_AGM_SUBCOMMANDS]
  const destination = groupMap?.[subcommand.name as keyof typeof groupMap] ?? null
  return {
    destination,
    options: subcommand.options ?? [],
  }
}

function parseOpenAgmCommand(option: DiscordInteractionOption): ParsedAgmCommand {
  const destination = getStringOption(option.options ?? [], 'page')
  if (!destination || !OPEN_PAGE_DESTINATIONS.has(destination) || !isAgmSubcommand(destination)) {
    return { destination: null, options: [] }
  }
  return { destination, options: [] }
}

function parseAgmCommand(payload: DiscordInteractionPayload): ParsedAgmCommand {
  const option = payload.data?.options?.[0]
  if (!option) return { destination: null, options: [] }

  if (option.type === DISCORD_OPTION_TYPE_SUBCOMMAND_GROUP) {
    return parseGroupedAgmCommand(option)
  }

  if (option.type !== DISCORD_OPTION_TYPE_SUBCOMMAND) {
    return { destination: null, options: [] }
  }

  if (option.name === 'open') return parseOpenAgmCommand(option)
  if (!isAgmSubcommand(option.name)) return { destination: null, options: [] }

  return {
    destination: option.name,
    options: option.options ?? [],
  }
}

function getOption(
  options: readonly DiscordInteractionOption[],
  name: string,
): DiscordInteractionOption | null {
  return options.find((option) => option.name === name) ?? null
}

function getStringOption(
  options: readonly DiscordInteractionOption[],
  name: string,
): string | null {
  const option = getOption(options, name)
  if (option?.type !== DISCORD_OPTION_TYPE_STRING || typeof option.value !== 'string') {
    return null
  }
  const value = option.value.trim()
  return value.length > 0 ? value : null
}

function getIntegerOption(
  options: readonly DiscordInteractionOption[],
  name: string,
): number | null {
  const option = getOption(options, name)
  if (option?.type !== DISCORD_OPTION_TYPE_INTEGER || typeof option.value !== 'number') {
    return null
  }
  return Number.isInteger(option.value) ? option.value : null
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

function formatPoints(points: number): string {
  return points.toLocaleString('en-US')
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
  const messages = await loadDiscordBotMessages(resolveDiscordCommandLocale())

  if (payload.data?.name !== COMMAND_AGM) {
    return ephemeralReply(messages.unknownCommand)
  }

  const command = parseAgmCommand(payload)
  const { destination } = command
  if (!destination || destination === 'guide') {
    return handleGuide(messages)
  }

  if (destination === 'help') {
    return handleHelp(messages)
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
    return handlePublishQuickStarter(tenant, payload, messages, command.options)
  }

  if (isAdminOnlySubcommand(destination) && !(await isSiteAdminForTenant(tenant, payload))) {
    return ephemeralReply(messages.adminOnly)
  }

  if (destination === 'killbot') {
    return handleKillbot(tenant, messages)
  }

  if (destination === 'points') {
    return handlePointsAdjustment(tenant, payload, messages, command.options)
  }

  if (destination === 'balance') {
    return handlePointBalance(tenant, payload, messages)
  }

  if (destination === 'withdraw') {
    return handleWithdrawRequest(tenant, payload, messages, command.options)
  }

  switch (destination) {
    case 'quick':
      return handleQuickStarter(tenant, payload, messages)
    case 'home':
      return replyWithDiscordAppLoginLink(messages.homeReady, tenant, payload, messages, '/')
    case 'me':
      return replyWithDiscordAppLoginLink(messages.meReady, tenant, payload, messages, '/me')
    case 'verify':
      return replyWithDiscordAppLoginLink(
        messages.verifyReady,
        tenant,
        payload,
        messages,
        '/onboarding/albion',
      )
    case 'events':
      return handleEvents(tenant, payload, messages)
    case 'regear':
      return replyWithDiscordAppLoginLink(messages.regearReady, tenant, payload, messages, '/regear')
    case 'shop':
      return replyWithDiscordAppLoginLink(messages.shopReady, tenant, payload, messages, '/shop')
    case 'craft':
      return replyWithDiscordAppLoginLink(messages.craftReady, tenant, payload, messages, '/craft/queue')
    case 'wallet':
      return replyWithDiscordAppLoginLink(messages.walletReady, tenant, payload, messages, '/me/wallet')
    case 'admin':
      return replyWithDiscordAppLoginLink(messages.adminReady, tenant, payload, messages, '/admin/dashboard')
  }
}

function quickStarterButtonLabels(messages: DiscordBotMessages): DiscordQuickStarterButtonLabels {
  return {
    login: messages.quickButtonLogin,
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

async function loadQuickStarterPanelState(guildId: string): Promise<QuickStarterPanelState> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('app_settings')
    .select('key, value')
    .eq('guild_id', guildId)
    .in('key', QUICK_STARTER_PANEL_SETTING_KEY_LIST)
  if (error) throw new Error(error.message)

  const map = new Map<string, string>()
  for (const row of data ?? []) {
    if (typeof row.key === 'string' && typeof row.value === 'string') {
      map.set(row.key, row.value)
    }
  }

  const legacyMessage = map.get(QUICK_STARTER_PANEL_SETTING_KEYS.legacyMessage) ?? ''
  const savedColor = map.get(QUICK_STARTER_PANEL_SETTING_KEYS.color) ?? ''
  return {
    title:
      map.get(QUICK_STARTER_PANEL_SETTING_KEYS.title) ??
      DEFAULT_DISCORD_QUICK_STARTER_PANEL_TITLE,
    description:
      map.get(QUICK_STARTER_PANEL_SETTING_KEYS.description) ??
      (legacyMessage || DEFAULT_DISCORD_QUICK_STARTER_PANEL_DESCRIPTION),
    color: HEX_COLOR_PATTERN.test(savedColor)
      ? savedColor
      : DEFAULT_DISCORD_QUICK_STARTER_PANEL_COLOR,
    footer:
      map.get(QUICK_STARTER_PANEL_SETTING_KEYS.footer) ??
      DEFAULT_DISCORD_QUICK_STARTER_PANEL_FOOTER,
    messageId: map.get(QUICK_STARTER_PANEL_SETTING_KEYS.messageId) ?? '',
    messageChannelId: map.get(QUICK_STARTER_PANEL_SETTING_KEYS.messageChannelId) ?? '',
  }
}

async function upsertQuickStarterPanelSettings(
  guildId: string,
  entries: Partial<Record<QuickStarterPanelSettingKey, string>>,
): Promise<void> {
  const now = new Date().toISOString()
  const rows = Object.entries(entries).map(([key, value]) => ({
    guild_id: guildId,
    key,
    value: value ?? '',
    updated_at: now,
  }))
  if (rows.length === 0) return

  const db = getAdminClient()
  const { error } = await db
    .from('app_settings')
    .upsert(rows, { onConflict: 'guild_id,key' })
  if (error) throw new Error(error.message)
  revalidateAppSettingsCache(guildId)
}

function quickStarterPanelDescription(
  options: readonly DiscordInteractionOption[],
  state: QuickStarterPanelState,
): string {
  const customMessage = getStringOption(options, 'message')
  return customMessage
    ? customMessage.slice(0, QUICK_STARTER_PANEL_DESCRIPTION_MAX_LENGTH)
    : state.description
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
  options: readonly DiscordInteractionOption[],
): Promise<DiscordInteractionResponse> {
  if (!payload.guild_id) return ephemeralReply(messages.notInGuild)
  if (!payload.channel_id) return ephemeralReply(messages.quickPublishChannelMissing)

  try {
    const state = await loadQuickStarterPanelState(tenant.id)
    const descriptionTemplate = quickStarterPanelDescription(options, state)
    const payloadBody = buildDiscordQuickStarterMessagePayload({
      discordGuildId: payload.guild_id,
      tenantName: tenant.name,
      titleTemplate: state.title,
      descriptionTemplate,
      color: state.color,
      footerTemplate: state.footer,
      labels: quickStarterButtonLabels(messages),
    })

    let messageId = state.messageId
    if (messageId && state.messageChannelId === payload.channel_id) {
      try {
        await updateDiscordChannelMessage(payload.channel_id, messageId, payloadBody)
      } catch (error) {
        if (!(error instanceof DiscordChannelMessageError) || error.status !== 404) {
          throw error
        }
        messageId = await sendDiscordChannelMessage(payload.channel_id, payloadBody)
      }
    } else {
      messageId = await sendDiscordChannelMessage(payload.channel_id, payloadBody)
    }

    await upsertQuickStarterPanelSettings(tenant.id, {
      [QUICK_STARTER_PANEL_SETTING_KEYS.channelId]: payload.channel_id,
      [QUICK_STARTER_PANEL_SETTING_KEYS.title]: state.title,
      [QUICK_STARTER_PANEL_SETTING_KEYS.description]: descriptionTemplate,
      [QUICK_STARTER_PANEL_SETTING_KEYS.color]: state.color,
      [QUICK_STARTER_PANEL_SETTING_KEYS.footer]: state.footer,
      [QUICK_STARTER_PANEL_SETTING_KEYS.messageId]: messageId,
      [QUICK_STARTER_PANEL_SETTING_KEYS.messageChannelId]: payload.channel_id,
      [QUICK_STARTER_PANEL_SETTING_KEYS.publishedAt]: new Date().toISOString(),
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
  revalidateTenantDirectoryCache()

  const seedRows = SLOT_ROLES.map((role_name) => ({
    guild_id: tenantRow.id,
    role_name,
    silver: 0,
    payout_rate_percent: 100,
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
  options: readonly DiscordInteractionOption[],
): Promise<DiscordInteractionResponse> {
  const adminDiscordId = getInvokerDiscordId(payload)
  if (!adminDiscordId) return ephemeralReply(messages.adminOnly)

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

async function findActiveGuildMember(
  guildId: string,
  discordId: string,
): Promise<ActiveGuildMemberResult> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('guild_avatars')
    .select('discord_id, username, withdrawn_at')
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data || data.withdrawn_at) return { ok: true, member: null }
  return {
    ok: true,
    member: {
      discordId: data.discord_id as string,
      username: (data.username as string | null) ?? null,
    },
  }
}

async function handlePointBalance(
  tenant: TenantBindResult,
  payload: DiscordInteractionPayload,
  messages: DiscordBotMessages,
): Promise<DiscordInteractionResponse> {
  const discordId = getInvokerDiscordId(payload)
  if (!discordId) return ephemeralReply(messages.notInGuild)

  const loadedMember = await findActiveGuildMember(tenant.id, discordId)
  if (!loadedMember.ok) {
    log.error('[discord-commands] balance member lookup failed', loadedMember.error, {
      tenant_id: tenant.id,
      discord_id: discordId,
    })
    return ephemeralReply(messages.handlerFailed)
  }
  if (!loadedMember.member) {
    return ephemeralReply(
      format(messages.balanceMemberNotFound, {
        url: tenantCommandUrl(tenant, '/onboarding/albion'),
      }),
    )
  }

  const db = getAdminClient()
  const points = await getMemberSpendablePointBalance(db, tenant.id, discordId)
  if (points.error) {
    log.error('[discord-commands] balance lookup failed', points.error, {
      tenant_id: tenant.id,
      discord_id: discordId,
    })
    return ephemeralReply(messages.handlerFailed)
  }

  return ephemeralReply(
    format(messages.balanceReady, {
      name: tenant.name,
      balance: formatPoints(points.balance),
      escrowed: formatPoints(points.escrowed),
      spendable: formatPoints(points.spendable),
      url: tenantCommandUrl(tenant, '/me/wallet'),
    }),
  )
}

async function handleWithdrawRequest(
  tenant: TenantBindResult,
  payload: DiscordInteractionPayload,
  messages: DiscordBotMessages,
  options: readonly DiscordInteractionOption[],
): Promise<DiscordInteractionResponse> {
  const discordId = getInvokerDiscordId(payload)
  if (!discordId) return ephemeralReply(messages.notInGuild)

  const amount = getIntegerOption(options, 'amount')
  if (!isPostgresPositiveInt(amount)) {
    return ephemeralReply(
      format(messages.withdrawInvalidAmount, {
        max: formatPoints(POSTGRES_INT_MAX),
      }),
    )
  }

  const loadedMember = await findActiveGuildMember(tenant.id, discordId)
  if (!loadedMember.ok) {
    log.error('[discord-commands] withdraw member lookup failed', loadedMember.error, {
      tenant_id: tenant.id,
      discord_id: discordId,
    })
    return ephemeralReply(messages.handlerFailed)
  }
  if (!loadedMember.member) {
    return ephemeralReply(
      format(messages.withdrawMemberNotFound, {
        url: tenantCommandUrl(tenant, '/onboarding/albion'),
      }),
    )
  }

  const onboardingGate = await getAlbionOnboardingGateState(discordId, tenant.id)
  if (!onboardingGate.resourceTrusted) {
    return ephemeralReply(
      format(messages.withdrawAlbionVerificationRequired, {
        url: tenantCommandUrl(tenant, '/onboarding/albion'),
      }),
    )
  }

  const db = getAdminClient()
  const points = await getMemberSpendablePointBalance(db, tenant.id, discordId)
  if (points.error) {
    log.error('[discord-commands] withdraw balance lookup failed', points.error, {
      tenant_id: tenant.id,
      discord_id: discordId,
    })
    return ephemeralReply(messages.handlerFailed)
  }
  if (points.spendable < amount) {
    return ephemeralReply(
      format(messages.withdrawInsufficientBalance, {
        spendable: formatPoints(points.spendable),
      }),
    )
  }

  const { data, error } = await db
    .from('exchange_requests')
    .insert({
      guild_id: tenant.id,
      discord_id: discordId,
      username: loadedMember.member.username ?? getInvokerDisplayName(payload) ?? 'Discord user',
      silver: amount,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') {
      return ephemeralReply(
        format(messages.withdrawPendingExists, {
          url: tenantCommandUrl(tenant, '/me/wallet'),
        }),
      )
    }
    log.error('[discord-commands] withdraw insert failed', error, {
      tenant_id: tenant.id,
      discord_id: discordId,
      amount,
    })
    return ephemeralReply(messages.handlerFailed)
  }

  void sendAdminNotification({
    guildId: tenant.id,
    topic: 'exchange',
    sourceTable: 'exchange_requests',
    sourceId: data.id as string,
    title: messages.withdrawAdminNotifyTitle,
    body: format(messages.withdrawAdminNotifyBody, {
      user: loadedMember.member.username ?? getInvokerDisplayName(payload) ?? `<@${discordId}>`,
      amount: formatPoints(amount),
    }),
    url: '/admin/dashboard/approvals?tab=exchange',
  })

  return ephemeralReply(
    format(messages.withdrawReady, {
      name: tenant.name,
      amount: formatPoints(amount),
      url: tenantCommandUrl(tenant, '/me/wallet'),
    }),
  )
}

async function replyWithDiscordAppLoginLink(
  template: string,
  tenant: TenantBindResult,
  payload: DiscordInteractionPayload,
  messages: DiscordBotMessages,
  path: string,
): Promise<DiscordInteractionResponse> {
  const discordId = getInvokerDiscordId(payload)
  if (!discordId) return ephemeralReply(messages.notInGuild)
  try {
    const url = await createDiscordAppLoginLink({
      guildId: tenant.id,
      tenantSlug: tenant.slug,
      discordId,
      returnTo: path,
    })
    return appLoginReply(
      format(template, {
        name: tenant.name,
        url: messages.appLoginOpenHint,
      }),
      url,
      messages,
    )
  } catch (error) {
    log.error('[discord-commands] create app login link failed', error, {
      tenant_id: tenant.id,
      discord_id: discordId,
      return_to: path,
    })
    return ephemeralReply(messages.handlerFailed)
  }
}

function appLoginButton(url: string, messages: DiscordBotMessages): DiscordMessageComponent {
  return {
    type: 1,
    components: [
      {
        type: 2,
        style: 5,
        label: messages.appLoginOpenButton,
        url,
      },
    ],
  }
}

function appLoginReply(
  content: string,
  url: string,
  messages: DiscordBotMessages,
  additionalComponents: DiscordMessageComponent[] = [],
): DiscordInteractionResponse {
  return ephemeralReply(content, {
    suppressEmbeds: true,
    components: [appLoginButton(url, messages), ...additionalComponents],
  })
}

export async function handleDiscordAppLoginInteraction(
  payload: DiscordInteractionPayload,
): Promise<DiscordInteractionResponse> {
  const action = parseDiscordAppLoginCustomId(payload.data?.custom_id)
  const messages = await loadDiscordBotMessages(resolveDiscordCommandLocale())
  if (!action) return ephemeralReply(messages.unsupportedInteraction)
  if (!payload.guild_id) return ephemeralReply(messages.notInGuild)

  const tenant = await findTenantByDiscordGuild(payload.guild_id)
  if (!tenant) {
    return ephemeralReply(format(messages.guildNotLinked, { docsUrl: tenantUrl(null, '/faq') }))
  }

  const discordId = getInvokerDiscordId(payload)
  if (!discordId) return ephemeralReply(messages.notInGuild)
  try {
    const url = await createDiscordAppLoginLink({
      guildId: tenant.id,
      tenantSlug: tenant.slug,
      discordId,
      returnTo: discordAppLoginReturnPath(action.destination),
    })
    return appLoginReply(format(messages.appLoginReady, { name: tenant.name }), url, messages)
  } catch (error) {
    log.error('[discord-commands] create component app login link failed', error, {
      tenant_id: tenant.id,
      discord_id: discordId,
      destination: action.destination,
    })
    return ephemeralReply(messages.handlerFailed)
  }
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

function handleHelp(messages: DiscordBotMessages): DiscordInteractionResponse {
  return ephemeralReply(
    format(messages.helpReady, {
      guideUrl: tenantUrl(null, '/member-quick-guide.html'),
      docsUrl: tenantUrl(null, '/faq'),
    }),
  )
}

async function handleEvents(
  tenant: TenantBindResult,
  payload: DiscordInteractionPayload,
  messages: DiscordBotMessages,
): Promise<DiscordInteractionResponse> {
  const discordId = getInvokerDiscordId(payload)
  if (!discordId) return ephemeralReply(messages.notInGuild)
  let loginUrl: string
  try {
    loginUrl = await createDiscordAppLoginLink({
      guildId: tenant.id,
      tenantSlug: tenant.slug,
      discordId,
      returnTo: '/events',
    })
  } catch (error) {
    log.error('[discord-commands] create events app login link failed', error, {
      tenant_id: tenant.id,
      discord_id: discordId,
    })
    return ephemeralReply(messages.handlerFailed)
  }
  const event = await findUpcomingEvent(tenant.id)
  let eventUrl = ''
  if (event) {
    try {
      eventUrl = await createDiscordAppLoginLink({
        guildId: tenant.id,
        tenantSlug: tenant.slug,
        discordId,
        returnTo: `/events/${event.id}`,
      })
    } catch (error) {
      log.error('[discord-commands] create next-event app login link failed', error, {
        tenant_id: tenant.id,
        discord_id: discordId,
        event_id: event.id,
      })
    }
  }
  const nextBlock = event
    ? format(messages.eventsNextBlock, {
        title: event.title,
        when: event.gatherAt ? formatGatherTimestamp(event.gatherAt) : '-',
        eventUrl: messages.appLoginOpenHint,
      })
    : ''
  const signupMessages = event ? await loadDiscordEventSignupMessages() : null

  return appLoginReply(
    format(messages.eventsReady, {
      name: tenant.name,
      url: messages.appLoginOpenHint,
      nextBlock,
    }),
    loginUrl,
    messages,
    event && signupMessages
      ? buildDiscordEventSignupComponents({
          eventId: event.id,
          eventUrl: eventUrl || loginUrl,
          labels: signupMessages,
        })
      : [],
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
