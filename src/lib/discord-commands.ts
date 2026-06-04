// Discord 슬래시 커맨드 핸들러 — interactions endpoint 가 라우팅한 뒤 호출.
//
// Slash command:
//   /agm <destination> — 사이트 기능으로 이동하는 단일 네비게이션 명령어.
//
// Discord 명령어는 상태 변경을 하지 않는다. 복잡한 입력, 승인, 업로드, 설정은
// 모두 웹 화면에서 처리하고, 여기서는 정확한 진입점 링크만 ephemeral 로 돌려준다.

import { getAdminClient } from '@/lib/supabase-admin'
import { buildDiscordStartHref } from '@/lib/discord-auth-url'
import { tenantUrl } from '@/lib/tenant-resolver'
import { isLocale, type Locale } from '@/i18n/locales'
import { killbotDashboardUrl } from '@/lib/killbot'
import {
  ephemeralReply,
  type DiscordInteractionPayload,
  type DiscordInteractionResponse,
} from '@/lib/discord-interactions'

export const COMMAND_AGM = 'agm'
export const DEFAULT_DISCORD_COMMAND_LOCALE = 'en' satisfies Locale

export const AGM_SUBCOMMANDS = [
  'home',
  'me',
  'verify',
  'events',
  'regear',
  'shop',
  'craft',
  'wallet',
  'admin',
  'guide',
  'killbot',
] as const

export type AgmSubcommand = typeof AGM_SUBCOMMANDS[number]

export const ALL_COMMAND_NAMES = [COMMAND_AGM] as const
const ADMIN_ONLY_AGM_SUBCOMMANDS = ['admin', 'killbot'] as const satisfies readonly AgmSubcommand[]

export interface DiscordBotMessages {
  unsupportedInteraction: string
  handlerFailed: string
  notInGuild: string
  guildNotLinked: string
  adminOnly: string
  unknownCommand: string
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

  if (!tenant) {
    const docsUrl = tenantUrl(null, '/faq')
    return ephemeralReply(format(messages.guildNotLinked, { docsUrl }))
  }

  if (isAdminOnlySubcommand(destination) && !(await isSiteAdminForTenant(tenant, payload))) {
    return ephemeralReply(messages.adminOnly)
  }

  if (destination === 'killbot') {
    return handleKillbot(tenant, messages)
  }

  switch (destination) {
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
