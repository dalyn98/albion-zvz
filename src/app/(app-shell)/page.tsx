import { getAdminClient } from '@/lib/supabase-admin'
import type { Event } from '@/types'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { headers } from 'next/headers'
import { Archive, ArrowRight, BookOpen, Plus } from 'lucide-react'
import { formatGatherTimeFor, isImminent } from '@/lib/gather-time'
import { getLocale } from '@/lib/locale'
import { getAppSetting } from '@/lib/app-settings'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId, getPrimaryTenantId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'
import { getMarketingPaths } from '@/lib/marketing-paths-request'
import HomeEventList, {
  type HomeEventCardData,
  type HomeEventKind,
} from '@/components/HomeEventList'
import NoticeBannerWithAdmin from '@/components/NoticeBannerWithAdmin'
import HomeAdminPendingCard from '@/components/HomeAdminPendingCard'
import { getAdminBadgeCounts } from '@/lib/admin-badges'
import { sessionCanCreateOrManageEvents } from '@/lib/event-permissions'
import { CAP } from '@/lib/permissions'
import { canUseAllianceEventFeaturesForSession } from '@/lib/albion-identity'
import {
  resolveHomeEventMyStatus,
  type HomeEventMyStatus,
} from '@/lib/home-event-status'
import { isMemberEventsWorkspace } from '@/lib/app-workspaces'

// Homepage reflects the live DB, so never prerender at build — a static
// snapshot would show stale or deleted events.
export const dynamic = 'force-dynamic'

// Keep the same cutoff as isEnded(): ended battles move to /archive, so the
// home query should not keep pulling historical rows just to discard them.
const BATTLE_DURATION_MS = 60 * 60 * 1000

type HomeEventRow = Pick<
  Event,
  | 'id'
  | 'title'
  | 'gather_time'
  | 'gather_at'
  | 'gather_location'
  | 'battle_started_at'
  | 'category'
>

interface EventWithCounts extends HomeEventRow {
  total: number
  assigned: number
  myStatus: HomeEventMyStatus | null
}

interface EventSlotSummary {
  total: number
  assigned: number
  hasAssignedSlot: boolean
  hasPendingSlot: boolean
  hasAvailableSlot: boolean
}

async function getActiveEvents(
  guildId: string,
  viewerDiscordId: string | null,
): Promise<EventWithCounts[]> {
  const db = getAdminClient()
  const battleCutoffIso = new Date(
    Date.now() - BATTLE_DURATION_MS,
  ).toISOString()
  const { data: events } = await db
    .from('events')
    .select(
      'id, title, gather_time, gather_at, gather_location, battle_started_at, category',
    )
    .eq('guild_id', guildId)
    // draft 이벤트는 관리자 대시보드에서만 노출 — 공개 홈에서는 숨김.
    .eq('status', 'published')
    .or(`battle_started_at.is.null,battle_started_at.gte.${battleCutoffIso}`)
    .order('gather_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (!events || events.length === 0) return []

  const active = events as HomeEventRow[]
  if (active.length === 0) return []

  const ids = active.map((e) => e.id)
  const [partiesRes, tentativeRes] = await Promise.all([
    db
      .from('parties')
      .select(
        'event_id, slots(id, assigned_discord_id, requested_discord_id, is_hidden)',
      )
      .eq('guild_id', guildId)
      .in('event_id', ids),
    viewerDiscordId
      ? db
          .from('event_tentative_signups')
          .select('event_id')
          .eq('guild_id', guildId)
          .eq('discord_id', viewerDiscordId)
          .in('event_id', ids)
      : Promise.resolve({ data: [] }),
  ])

  const totals = new Map<string, EventSlotSummary>()
  for (const p of (partiesRes.data ?? []) as {
    event_id: string
    slots:
      | {
          id: string
          assigned_discord_id: string | null
          requested_discord_id: string | null
          is_hidden: boolean
        }[]
      | null
  }[]) {
    const current = totals.get(p.event_id) ?? {
      total: 0,
      assigned: 0,
      hasAssignedSlot: false,
      hasPendingSlot: false,
      hasAvailableSlot: false,
    }
    const slots = (p.slots ?? []).filter((s) => !s.is_hidden)
    current.total += slots.length
    current.assigned += slots.filter((s) => s.assigned_discord_id).length
    if (viewerDiscordId) {
      current.hasAssignedSlot ||= slots.some(
        (slot) => slot.assigned_discord_id === viewerDiscordId,
      )
      current.hasPendingSlot ||= slots.some(
        (slot) => slot.requested_discord_id === viewerDiscordId,
      )
      current.hasAvailableSlot ||= slots.some(
        (slot) => !slot.assigned_discord_id && !slot.requested_discord_id,
      )
    }
    totals.set(p.event_id, current)
  }

  const tentativeEventIds = new Set(
    (tentativeRes.data ?? []).map((row) => row.event_id as string),
  )

  return active.map((e) => {
    const eventTotals = totals.get(e.id) ?? {
      total: 0,
      assigned: 0,
      hasAssignedSlot: false,
      hasPendingSlot: false,
      hasAvailableSlot: false,
    }

    return {
      ...e,
      total: eventTotals.total,
      assigned: eventTotals.assigned,
      myStatus: viewerDiscordId
        ? resolveHomeEventMyStatus({
            hasAssignedSlot: eventTotals.hasAssignedSlot,
            hasPendingSlot: eventTotals.hasPendingSlot,
            hasTentativeSignup: tentativeEventIds.has(e.id),
            hasAvailableSlot: eventTotals.hasAvailableSlot,
          })
        : null,
    }
  })
}

function classifyScheduled(
  event: Pick<HomeEventRow, 'battle_started_at' | 'gather_at'>,
): HomeEventKind {
  if (event.battle_started_at || isImminent(event.gather_at)) return 'imminent'
  return 'upcoming'
}

// Layout-level gate (src/app/layout.tsx) blocks general non-members before
// this component runs. Same-alliance participants can also reach this page,
// but resource/admin surfaces stay hidden by their own gates.
export default async function HomePage() {
  const [t, locale, session, marketingPaths, headersList] = await Promise.all([
    getTranslations(),
    getLocale(),
    getSession(),
    getMarketingPaths(),
    headers(),
  ])
  const isEventsWorkspace = isMemberEventsWorkspace(
    headersList.get('x-pathname'),
  )

  // 홈은 공개 게이트가 걸려 있어 사실상 멤버만 들어오지만, 세션이 없어도 primary
  // tenant 로 fallback 해 레이아웃 상 게이트가 렌더하는 동안 깨지지 않게 한다.
  const guildId = session
    ? await getSessionGuildId(session)
    : await getPrimaryTenantId()

  const [
    noticeMessage,
    noticeImageUrl,
    events,
    tz,
    adminPendingEnabledRaw,
    uxRefreshEnabledRaw,
  ] =
    await Promise.all([
      getAppSetting('events_notice_message', '', guildId),
      getAppSetting('events_notice_image_url', '', guildId),
      getActiveEvents(guildId, session?.discordId ?? null),
      getTenantTimezone(guildId),
      getAppSetting('home_admin_pending_card_enabled', 'false', guildId),
      getAppSetting('ux_refresh_v2_enabled', 'false', guildId),
    ])

  const adminPendingEnabled =
    adminPendingEnabledRaw === 'true' && (session?.isAdmin ?? false)
  const uxRefreshEnabled = uxRefreshEnabledRaw === 'true'
  const adminBadges = adminPendingEnabled
    ? await getAdminBadgeCounts(guildId)
    : null
  const allianceEventAllowed = session
    ? await canUseAllianceEventFeaturesForSession(session.discordId, guildId)
    : false
  const isBombSquadCallerOnly =
    session?.isBombSquadCaller === true &&
    !session.isMember &&
    !session.isAdmin &&
    !session.isGuest &&
    !allianceEventAllowed
  const isAllianceEventOnly =
    allianceEventAllowed &&
    !!session &&
    !session.isMember &&
    !session.isAdmin &&
    !session.isGuest

  // Prefer gather_at (ISO) for locale-aware formatting; fall back to stored
  // gather_time (always Korean) for legacy rows that predate gather_at.
  const displayGatherTime = (event: HomeEventRow): string =>
    event.gather_at
      ? formatGatherTimeFor(locale, event.gather_at, tz)
      : event.gather_time

  const toCard = (event: EventWithCounts): HomeEventCardData => ({
    id: event.id,
    title: event.title,
    gather_location: event.gather_location,
    displayGatherTime: displayGatherTime(event),
    total: event.total,
    assigned: event.assigned,
    kind: classifyScheduled(event),
    battleStarted: !!event.battle_started_at,
    category: event.category,
    myStatus: event.myStatus,
  })

  const cards = events.map(toCard)
  const visibleCards = isEventsWorkspace ? cards : cards.slice(0, 3)

  return (
    <main className="flex-1 px-4 py-6 sm:py-8 max-w-3xl xl:max-w-6xl 2xl:max-w-7xl mx-auto w-full space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            {isEventsWorkspace ? t('home.title') : t('home.today.title')}
          </h1>
          <p className="text-gray-400 text-sm">
            {isEventsWorkspace ? t('home.subtitle') : t('home.today.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-2 sm:flex-shrink-0">
          {/* 길드원이 사이트 사용법을 찾을 수 있는 유일한 진입점. 사이드바는
              어드민 전용이라 일반 멤버는 docs 로 도달할 경로가 없다. host-aware
              path 라 canonical/subdomain 모두 동작. */}
          {isEventsWorkspace ? (
            <Link
              href={marketingPaths.docs}
              className="flex items-center justify-center gap-1.5 text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-2 rounded-lg transition-colors text-sm whitespace-nowrap flex-1 sm:flex-initial"
            >
              <BookOpen size={14} />
              {t('home.viewDocs')}
            </Link>
          ) : (
            <Link
              href="/events"
              className="flex items-center justify-center gap-1.5 text-gray-300 hover:text-white border border-gray-700 hover:border-amber-500/50 px-3 py-2 rounded-lg transition-colors text-sm whitespace-nowrap flex-1 sm:flex-initial"
            >
              {t('home.today.viewAllEvents')}
              <ArrowRight size={14} />
            </Link>
          )}
          {/* `/archive` 사이드바 링크가 빠진 후 유일한 진입점 — 종료된 전투 회고가
              필요한 시점은 결국 events 페이지에서 시작하는 흐름이라 자연스럽다. */}
          {isEventsWorkspace &&
            !isBombSquadCallerOnly &&
            !isAllianceEventOnly && (
              <Link
                href="/archive"
                className="flex items-center justify-center gap-1.5 text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-2 rounded-lg transition-colors text-sm whitespace-nowrap flex-1 sm:flex-initial"
              >
                <Archive size={14} />
                {t('home.viewArchive')}
              </Link>
            )}
          {isEventsWorkspace && sessionCanCreateOrManageEvents(session) && (
            <Link
              href="/admin/dashboard/events/new"
              className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-3 py-2 rounded-lg transition-colors text-sm whitespace-nowrap flex-1 sm:flex-initial"
            >
              <Plus size={16} />
              {t('home.newEvent')}
            </Link>
          )}
        </div>
      </div>

      <NoticeBannerWithAdmin
        message={noticeMessage}
        imageUrl={noticeImageUrl}
        target="events"
        canManageNotice={sessionHas(session, CAP.SETTINGS_GENERAL)}
      />

      {!isEventsWorkspace && adminBadges && (
        <HomeAdminPendingCard badges={adminBadges} />
      )}

      {!isEventsWorkspace && events.length > 0 && (
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">
              {t('home.today.nextEyebrow')}
            </p>
            <h2 className="mt-1 text-lg font-bold text-white">
              {t('home.today.nextTitle')}
            </h2>
          </div>
          {events.length > visibleCards.length && (
            <span className="text-xs text-gray-500">
              {t('home.today.moreCount', {
                count: events.length - visibleCards.length,
              })}
            </span>
          )}
        </div>
      )}

      {events.length === 0 ? (
        <div
          data-tour-id="member-tour-events"
          className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center"
        >
          <p className="text-gray-400">{t('home.empty')}</p>
        </div>
      ) : (
        <div data-tour-id="member-tour-events">
          <HomeEventList events={visibleCards} adaptiveLayout={uxRefreshEnabled} />
        </div>
      )}

    </main>
  )
}
