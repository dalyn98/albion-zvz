// Discord 슬래시 커맨드 핸들러 — interactions endpoint 가 라우팅한 뒤 호출.
// 공개 명령 트리는 discord-command-catalog.mjs 한 곳에서 관리하며, 모든 작업은
// 서명된 guild/user context 를 tenant-scoped actor 로 변환한 뒤 실행한다.

import { getAdminClient } from '@/lib/supabase-admin'
import { revalidateAppSettingsCache } from '@/lib/app-settings-invalidation'
import { revalidateTenantDirectoryCache } from '@/lib/tenant-cache'
import {
  DiscordChannelMessageError,
  getDiscordGuild,
  mapDiscordLocale,
  sendDiscordChannelMessage,
  updateDiscordChannelMessage,
} from '@/lib/discord'
import { getAlbionOnboardingGateState } from '@/lib/albion-identity'
import { sendAdminNotification } from '@/lib/admin-notifications'
import { tenantUrl } from '@/lib/tenant-resolver'
import { isValidTenantSlug } from '@/lib/tenant-slug'
import { type Locale } from '@/i18n/locales'
import { getMemberSpendablePointBalance } from '@/lib/point-ledger'
import { isPostgresPositiveInt, POSTGRES_INT_MAX } from '@/lib/postgres-int'
import {
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
import { approveDiscordBrowserAuthAttempt } from '@/lib/discord-browser-auth'
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
  AGM_COMMAND_PATHS,
  handleDiscordCommandSuite,
  parseDiscordAgmCommand,
  type AgmCommandPath,
} from '@/lib/discord-command-suite'
import { loadDiscordCommandSuiteMessages } from '@/lib/discord-command-suite-messages'

export { handleDiscordCommandAutocomplete } from '@/lib/discord-command-suite'

export const COMMAND_AGM = 'agm'
export const DEFAULT_DISCORD_COMMAND_LOCALE = 'en' satisfies Locale
const DISCORD_OPTION_TYPE_USER = 6
const DISCORD_OPTION_TYPE_INTEGER = 4
const DISCORD_OPTION_TYPE_STRING = 3
const DISCORD_PERMISSION_ADMINISTRATOR = 1n << 3n
const DISCORD_PERMISSION_MANAGE_GUILD = 1n << 5n
const MAX_SETUP_SLUG_ATTEMPTS = 5

export const AGM_SUBCOMMANDS = AGM_COMMAND_PATHS

export type AgmSubcommand = AgmCommandPath

export const ALL_COMMAND_NAMES = [COMMAND_AGM] as const
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
  browserLoginApproved: string
  browserLoginInvalid: string
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
    browserLoginApproved: ns.browserLoginApproved ?? '',
    browserLoginInvalid: ns.browserLoginInvalid ?? '',
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

export function resolveDiscordCommandLocale(
  payload?: Pick<DiscordInteractionPayload, 'locale' | 'guild_locale'>,
): Locale {
  return mapDiscordLocale(payload?.locale) ??
    mapDiscordLocale(payload?.guild_locale) ??
    DEFAULT_DISCORD_COMMAND_LOCALE
}

export function resolveDiscordPublicPanelLocale(
  payload?: Pick<DiscordInteractionPayload, 'guild_locale'>,
): Locale {
  return mapDiscordLocale(payload?.guild_locale) ?? DEFAULT_DISCORD_COMMAND_LOCALE
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
  const locale = resolveDiscordCommandLocale(payload)
  const messages = await loadDiscordBotMessages(locale)

  if (payload.data?.name !== COMMAND_AGM) {
    return ephemeralReply(messages.unknownCommand)
  }

  const command = parseDiscordAgmCommand(payload)
  const { path } = command
  if (!path) return ephemeralReply(messages.unknownCommand)
  if (path === 'help') {
    const suiteMessages = await loadDiscordCommandSuiteMessages(locale)
    return ephemeralReply(suiteMessages.helpReady)
  }

  // DM 등 길드 컨텍스트 없는 호출은 길드별 링크를 만들 수 없으므로 안내만.
  if (!payload.guild_id) {
    return ephemeralReply(messages.notInGuild)
  }

  if (path === 'setup') {
    return handleSetup(payload, tenant, messages)
  }

  if (!tenant) {
    const docsUrl = tenantUrl(null, '/faq')
    return ephemeralReply(format(messages.guildNotLinked, { docsUrl }))
  }

  if (path === 'login') {
    const discordId = getInvokerDiscordId(payload)
    const approvalCode = getStringOption(command.options, 'code')
    if (
      !discordId ||
      !(await approveDiscordBrowserAuthAttempt({
        guildId: tenant.id,
        approvalCode,
        discordId,
      }))
    ) {
      return ephemeralReply(messages.browserLoginInvalid)
    }
    return ephemeralReply(messages.browserLoginApproved)
  }

  if (path === 'admin.quick-publish') {
    if (!(await isSiteAdminForTenant(tenant, payload))) return ephemeralReply(messages.adminOnly)
    const panelMessages = await loadDiscordBotMessages(resolveDiscordPublicPanelLocale(payload))
    return handlePublishQuickStarter(tenant, payload, messages, panelMessages, command.options)
  }

  if (path === 'admin.points') {
    if (!(await isSiteAdminForTenant(tenant, payload))) return ephemeralReply(messages.adminOnly)
    return handlePointsAdjustment(tenant, payload, messages, command.options)
  }

  if (path === 'admin.dashboard') {
    if (!(await isSiteAdminForTenant(tenant, payload))) return ephemeralReply(messages.adminOnly)
    return replyWithDiscordAppLoginLink(messages.adminReady, tenant, payload, messages, '/admin/dashboard')
  }

  if (path === 'wallet.balance') {
    return handlePointBalance(tenant, payload, messages)
  }

  if (path === 'wallet.withdraw') {
    return handleWithdrawRequest(tenant, payload, messages, command.options)
  }

  if (path === 'me.verify') {
    return replyWithDiscordAppLoginLink(
      messages.verifyReady,
      tenant,
      payload,
      messages,
      '/onboarding/albion',
    )
  }

  return handleDiscordCommandSuite({
    path,
    options: command.options,
    tenant,
    payload,
    locale,
  })
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

async function handlePublishQuickStarter(
  tenant: TenantBindResult,
  payload: DiscordInteractionPayload,
  messages: DiscordBotMessages,
  panelMessages: DiscordBotMessages,
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
      labels: quickStarterButtonLabels(panelMessages),
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
  const messages = await loadDiscordBotMessages(resolveDiscordCommandLocale(payload))
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
