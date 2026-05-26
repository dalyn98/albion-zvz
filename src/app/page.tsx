import { getAdminClient } from '@/lib/supabase-admin'
import type { Event } from '@/types'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Archive, BookOpen, Plus } from 'lucide-react'
import { formatGatherTimeFor, isImminent, isEnded } from '@/lib/gather-time'
import { getLocale } from '@/lib/locale'
import { getAppSetting } from '@/lib/app-settings'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId, getPrimaryTenantId } from '@/lib/tenant'
import { getTenantTimezone } from '@/lib/timezone-server'
import { getMarketingPaths } from '@/lib/marketing-paths'
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

// Homepage reflects the live DB, so never prerender at build — a static
// snapshot would show stale or deleted events.
export const dynamic = 'force-dynamic'

interface EventWithCounts extends Event {
  total: number
  assigned: number
}

async function getActiveEvents(guildId: string): Promise<EventWithCounts[]> {
  const db = getAdminClient()
  const { data: events } = await db
    .from('events')
    .select('*')
    .eq('guild_id', guildId)
    // draft 이벤트는 관리자 대시보드에서만 노출 — 공개 홈에서는 숨김.
    .eq('status', 'published')
    .order('gather_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (!events || events.length === 0) return []

  // 종료된 전투는 /archive 로 이동 — 메인 화면은 예정/임박만.
  const active = (events as Event[]).filter(
    (e) => !(e.battle_started_at && isEnded(e.battle_started_at)),
  )
  if (active.length === 0) return []

  const ids = active.map((e) => e.id)
  const partiesRes = await db
    .from('parties')
    .select('event_id, slots(id, assigned_discord_id, is_hidden)')
    .eq('guild_id', guildId)
    .in('event_id', ids)

  const totals = new Map<string, { total: number; assigned: number }>()
  for (const p of (partiesRes.data ?? []) as {
    event_id: string
    slots:
      | {
          id: string
          assigned_discord_id: string | null
          is_hidden: boolean
        }[]
      | null
  }[]) {
    const current = totals.get(p.event_id) ?? {
      total: 0,
      assigned: 0,
    }
    const slots = (p.slots ?? []).filter((s) => !s.is_hidden)
    current.total += slots.length
    current.assigned += slots.filter((s) => s.assigned_discord_id).length
    totals.set(p.event_id, current)
  }

  return active.map((e) => {
    const eventTotals = totals.get(e.id) ?? {
      total: 0,
      assigned: 0,
    }

    return {
      ...e,
      total: eventTotals.total,
      assigned: eventTotals.assigned,
    }
  })
}

function classifyScheduled(event: Event): HomeEventKind {
  if (event.battle_started_at || isImminent(event.gather_at)) return 'imminent'
  return 'upcoming'
}

// Layout-level gate (src/app/layout.tsx) blocks general non-members before
// this component runs. Same-alliance participants can also reach this page,
// but resource/admin surfaces stay hidden by their own gates.
export default async function HomePage() {
  const [t, locale, session, marketingPaths] = await Promise.all([
    getTranslations(),
    getLocale(),
    getSession(),
    getMarketingPaths(),
  ])

  // 홈은 공개 게이트가 걸려 있어 사실상 멤버만 들어오지만, 세션이 없어도 primary
  // tenant 로 fallback 해 레이아웃 상 게이트가 렌더하는 동안 깨지지 않게 한다.
  const guildId = session ? await getSessionGuildId(session) : await getPrimaryTenantId()

  const [
    noticeMessage,
    noticeImageUrl,
    events,
    tz,
    adminPendingEnabledRaw,
  ] = await Promise.all([
    getAppSetting('events_notice_message', '', guildId),
    getAppSetting('events_notice_image_url', '', guildId),
    getActiveEvents(guildId),
    getTenantTimezone(guildId),
    getAppSetting('home_admin_pending_card_enabled', 'false', guildId),
  ])

  const adminPendingEnabled = adminPendingEnabledRaw === 'true' && (session?.isAdmin ?? false)
  const adminBadges = adminPendingEnabled ? await getAdminBadgeCounts(guildId) : null
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
  const displayGatherTime = (event: Event): string =>
    event.gather_at ? formatGatherTimeFor(locale, event.gather_at, tz) : event.gather_time

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
  })

  const cards = events.map(toCard)

  return (
    <main className="flex-1 px-4 py-6 sm:py-8 max-w-3xl xl:max-w-6xl 2xl:max-w-7xl mx-auto w-full space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{t('home.title')}</h1>
          <p className="text-gray-400 text-sm">{t('home.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 sm:flex-shrink-0">
          {/* 길드원이 사이트 사용법을 찾을 수 있는 유일한 진입점. 사이드바는
              어드민 전용이라 일반 멤버는 docs 로 도달할 경로가 없다. host-aware
              path 라 canonical/subdomain 모두 동작. */}
          <Link
            href={marketingPaths.docs}
            className="flex items-center justify-center gap-1.5 text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-2 rounded-lg transition-colors text-sm whitespace-nowrap flex-1 sm:flex-initial"
          >
            <BookOpen size={14} />
            {t('home.viewDocs')}
          </Link>
          {/* `/archive` 사이드바 링크가 빠진 후 유일한 진입점 — 종료된 전투 회고가
              필요한 시점은 결국 events 페이지에서 시작하는 흐름이라 자연스럽다. */}
          {!isBombSquadCallerOnly && !isAllianceEventOnly && (
            <Link
              href="/archive"
              className="flex items-center justify-center gap-1.5 text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-2 rounded-lg transition-colors text-sm whitespace-nowrap flex-1 sm:flex-initial"
            >
              <Archive size={14} />
              {t('home.viewArchive')}
            </Link>
          )}
          {sessionCanCreateOrManageEvents(session) && (
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

      {adminBadges && <HomeAdminPendingCard badges={adminBadges} />}

      {events.length === 0 ? (
        <div
          data-tour-id="member-tour-events"
          className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center"
        >
          <p className="text-gray-400">{t('home.empty')}</p>
        </div>
      ) : (
        <div data-tour-id="member-tour-events">
          <HomeEventList events={cards} />
        </div>
      )}
    </main>
  )
}
