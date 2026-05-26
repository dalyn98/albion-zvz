// Discord 슬래시 커맨드 핸들러 — interactions endpoint 가 라우팅한 뒤 호출.
//
// Slash commands:
//   /home      — 길드 홈으로 이동 (테넌트 미연동 시 공식 가이드 폴백)
//   /docs      — 공식 가이드 (/faq) 로 이동
//   /guide     — 길드원 빠른 사용법 페이지로 이동
//   /killbotguild — 킬봇 운영 설명서로 이동
//   /upcoming  — 가장 임박한 이벤트 링크 (없으면 /events 목록)
//
// 모든 응답은 ephemeral — 명령을 친 본인만 보임. 채널을 어지럽히지 않게.

import { getAdminClient } from '@/lib/supabase-admin'
import { mapDiscordLocale } from '@/lib/discord'
import { tenantUrl } from '@/lib/tenant-resolver'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locales'
import {
  getKillbotConfig,
  killbotDashboardUrl,
  saveKillbotConfig,
  sendKillbotTestMessage,
} from '@/lib/killbot'
import {
  ephemeralReply,
  type DiscordInteractionPayload,
  type DiscordInteractionResponse,
} from '@/lib/discord-interactions'

// 슬래시 커맨드 이름은 영어 단일 — 사용자가 i18n 비활성을 명시함.
export const COMMAND_HOME = 'home'
export const COMMAND_DOCS = 'docs'
export const COMMAND_GUIDE = 'guide'
export const COMMAND_KILLBOT_GUILD = 'killbotguild'
export const COMMAND_UPCOMING = 'upcoming'
export const COMMAND_KILLBOT = 'killbot'

export const ALL_COMMAND_NAMES = [
  COMMAND_HOME,
  COMMAND_DOCS,
  COMMAND_GUIDE,
  COMMAND_KILLBOT_GUILD,
  COMMAND_UPCOMING,
  COMMAND_KILLBOT,
] as const

interface DiscordBotMessages {
  notInGuild: string
  guildNotLinked: string
  guildNotLinkedDocs: string
  homeReady: string
  docsReady: string
  guideReady: string
  killbotGuildReady: string
  upcomingNone: string
  upcoming: string
  killbotNoPermission: string
  killbotNoChannel: string
  killbotSetup: string
  killbotPaused: string
  killbotResumed: string
  killbotStatus: string
  killbotTestSent: string
  killbotNotConfigured: string
  killbotError: string
}

// next-intl 의 messages JSON 에서 discordBot 네임스페이스만 꺼내 평탄화.
// getTranslations 는 RSC request-context 가 필요해 interactions API 에서 못
// 쓴다. 대신 빌드 타임에 같이 번들된 src/messages/{locale}.json 을 동적
// import 해서 평문 string 만 꺼낸다.
async function loadMessages(locale: Locale): Promise<DiscordBotMessages> {
  const dict = (await import(`../messages/${locale}.json`)).default as Record<string, unknown>
  const ns = (dict.discordBot ?? {}) as Record<string, string>
  return {
    notInGuild: ns.notInGuild ?? '',
    guildNotLinked: ns.guildNotLinked ?? '',
    guildNotLinkedDocs: ns.guildNotLinkedDocs ?? '',
    homeReady: ns.homeReady ?? '',
    docsReady: ns.docsReady ?? '',
    guideReady: ns.guideReady ?? '',
    killbotGuildReady: ns.killbotGuildReady ?? '',
    upcomingNone: ns.upcomingNone ?? '',
    upcoming: ns.upcoming ?? '',
    killbotNoPermission: ns.killbotNoPermission ?? '',
    killbotNoChannel: ns.killbotNoChannel ?? '',
    killbotSetup: ns.killbotSetup ?? '',
    killbotPaused: ns.killbotPaused ?? '',
    killbotResumed: ns.killbotResumed ?? '',
    killbotStatus: ns.killbotStatus ?? '',
    killbotTestSent: ns.killbotTestSent ?? '',
    killbotNotConfigured: ns.killbotNotConfigured ?? '',
    killbotError: ns.killbotError ?? '',
  }
}

function format(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`)
}

const DISCORD_PERMISSION_ADMINISTRATOR = 1n << 3n
const DISCORD_PERMISSION_MANAGE_GUILD = 1n << 5n

export function canManageKillbot(payload: DiscordInteractionPayload): boolean {
  const raw = payload.member?.permissions
  if (!raw) return false
  try {
    const bits = BigInt(raw)
    return (
      (bits & DISCORD_PERMISSION_ADMINISTRATOR) !== 0n ||
      (bits & DISCORD_PERMISSION_MANAGE_GUILD) !== 0n
    )
  } catch {
    return false
  }
}

function getSubcommandName(payload: DiscordInteractionPayload): string {
  return payload.data?.options?.[0]?.name ?? 'status'
}

interface TenantBindResult {
  id: string
  slug: string
  name: string
}

// Discord guild_id 로 active tenant 를 찾는다. status 가 active 가 아닌
// (suspended/onboarding) 길드는 미연동과 동일하게 취급 — 공식 가이드로 폴백.
async function findTenantByDiscordGuild(
  discordGuildId: string,
): Promise<TenantBindResult | null> {
  const db = getAdminClient()
  const { data } = await db
    .from('tenants')
    .select('id, slug, name')
    .eq('discord_guild_id', discordGuildId)
    .eq('status', 'active')
    .maybeSingle()
  if (!data) return null
  return {
    id: data.id as string,
    slug: data.slug as string,
    name: data.name as string,
  }
}

interface UpcomingEventResult {
  id: string
  title: string
  gatherAt: string | null
}

// 길드의 가장 임박한 미래 이벤트 1 건. 정렬 기준은 gather_at asc — 이미
// 시작된 (battle_started_at != null) 이벤트는 제외해서 "다음에 모일 것" 만
// 노출한다. status='published' 인 것만 (draft 는 어드민 전용).
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

// 디스코드 클라이언트 locale → 우리가 지원하는 Locale. 미지원 언어는 ko 폴백.
function resolveLocale(payload: DiscordInteractionPayload): Locale {
  return mapDiscordLocale(payload.locale) ?? DEFAULT_LOCALE
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

export async function handleSlashCommand(
  payload: DiscordInteractionPayload,
): Promise<DiscordInteractionResponse> {
  const commandName = payload.data?.name
  const locale = resolveLocale(payload)
  const messages = await loadMessages(locale)

  if (commandName === COMMAND_GUIDE || commandName === COMMAND_KILLBOT_GUILD) {
    return commandName === COMMAND_GUIDE
      ? handleGuide(messages)
      : handleKillbotGuildGuide(messages)
  }

  // DM 등 길드 컨텍스트 없는 호출은 처리 안 함 — guild_id 없으면 안내만.
  if (!payload.guild_id) {
    return ephemeralReply(messages.notInGuild)
  }

  const tenant = await findTenantByDiscordGuild(payload.guild_id)

  switch (commandName) {
    case COMMAND_HOME:
      return handleHome(tenant, messages)
    case COMMAND_DOCS:
      return handleDocs(messages)
    case COMMAND_GUIDE:
      return handleGuide(messages)
    case COMMAND_KILLBOT_GUILD:
      return handleKillbotGuildGuide(messages)
    case COMMAND_UPCOMING:
      return handleUpcoming(tenant, messages)
    case COMMAND_KILLBOT:
      return handleKillbot(payload, tenant, messages)
    default:
      // 등록되지 않은 명령 — 등록 스크립트와 sync 안 됐을 때만 발생.
      return ephemeralReply(messages.guildNotLinked)
  }
}

function handleHome(
  tenant: TenantBindResult | null,
  messages: DiscordBotMessages,
): DiscordInteractionResponse {
  if (!tenant) {
    const docsUrl = tenantUrl(null, '/faq')
    return ephemeralReply(format(messages.guildNotLinked, { docsUrl }))
  }
  const homeUrl = tenantUrl(tenant.slug, '/')
  return ephemeralReply(format(messages.homeReady, { name: tenant.name, url: homeUrl }))
}

function handleDocs(messages: DiscordBotMessages): DiscordInteractionResponse {
  const docsUrl = tenantUrl(null, '/faq')
  return ephemeralReply(format(messages.docsReady, { url: docsUrl }))
}

function handleGuide(messages: DiscordBotMessages): DiscordInteractionResponse {
  const guideUrl = tenantUrl(null, '/member-quick-guide.html')
  return ephemeralReply(format(messages.guideReady, { url: guideUrl }))
}

function handleKillbotGuildGuide(messages: DiscordBotMessages): DiscordInteractionResponse {
  const guideUrl = tenantUrl(null, '/killbotguild.html')
  return ephemeralReply(format(messages.killbotGuildReady, { url: guideUrl }))
}

async function handleUpcoming(
  tenant: TenantBindResult | null,
  messages: DiscordBotMessages,
): Promise<DiscordInteractionResponse> {
  if (!tenant) {
    const docsUrl = tenantUrl(null, '/faq')
    return ephemeralReply(format(messages.guildNotLinkedDocs, { docsUrl }))
  }
  const event = await findUpcomingEvent(tenant.id)
  if (!event) {
    const eventsUrl = tenantUrl(tenant.slug, '/events')
    return ephemeralReply(format(messages.upcomingNone, { url: eventsUrl }))
  }
  const eventUrl = tenantUrl(tenant.slug, `/events/${event.id}`)
  const when = event.gatherAt ? formatGatherTimestamp(event.gatherAt) : '—'
  return ephemeralReply(
    format(messages.upcoming, {
      title: event.title,
      when,
      url: eventUrl,
    }),
  )
}

async function handleKillbot(
  payload: DiscordInteractionPayload,
  tenant: TenantBindResult | null,
  messages: DiscordBotMessages,
): Promise<DiscordInteractionResponse> {
  if (!tenant) {
    const docsUrl = tenantUrl(null, '/faq')
    return ephemeralReply(format(messages.guildNotLinkedDocs, { docsUrl }))
  }
  if (!canManageKillbot(payload)) {
    return ephemeralReply(messages.killbotNoPermission)
  }

  const db = getAdminClient()
  const subcommand = getSubcommandName(payload)
  const dashboardUrl = killbotDashboardUrl(tenant.slug)

  try {
    if (subcommand === 'setup') {
      const channelId = payload.channel_id
      if (!channelId) return ephemeralReply(messages.killbotNoChannel)
      const current = await getKillbotConfig(db, tenant.id)
      await saveKillbotConfig(db, tenant.id, {
        ...current,
        enabled: true,
        channelId,
      })
      return ephemeralReply(
        format(messages.killbotSetup, {
          channel: `<#${channelId}>`,
          dashboardUrl,
        }),
      )
    }

    if (subcommand === 'pause') {
      const current = await getKillbotConfig(db, tenant.id)
      await saveKillbotConfig(db, tenant.id, {
        ...current,
        enabled: false,
        channelId: current.channelId,
      })
      return ephemeralReply(format(messages.killbotPaused, { dashboardUrl }))
    }

    if (subcommand === 'resume') {
      const current = await getKillbotConfig(db, tenant.id)
      const channelId = current.channelId ?? payload.channel_id ?? null
      if (!channelId) return ephemeralReply(messages.killbotNoChannel)
      await saveKillbotConfig(db, tenant.id, {
        ...current,
        enabled: true,
        channelId,
      })
      return ephemeralReply(
        format(messages.killbotResumed, {
          channel: `<#${channelId}>`,
          dashboardUrl,
        }),
      )
    }

    if (subcommand === 'test') {
      const current = await getKillbotConfig(db, tenant.id)
      const channelId = current.channelId ?? payload.channel_id ?? null
      if (!channelId) return ephemeralReply(messages.killbotNoChannel)
      await sendKillbotTestMessage(db, tenant.id, channelId)
      return ephemeralReply(format(messages.killbotTestSent, { channel: `<#${channelId}>` }))
    }

    const current = await getKillbotConfig(db, tenant.id)
    if (!current.channelId) {
      return ephemeralReply(format(messages.killbotNotConfigured, { dashboardUrl }))
    }
    return ephemeralReply(
      format(messages.killbotStatus, {
        status: current.enabled ? 'ON' : 'OFF',
        channel: `<#${current.channelId}>`,
        minFame: current.minFame.toLocaleString('en-US'),
        dashboardUrl,
      }),
    )
  } catch (err) {
    return ephemeralReply(
      format(messages.killbotError, {
        message: err instanceof Error ? err.message : String(err),
      }),
    )
  }
}
