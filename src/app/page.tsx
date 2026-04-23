import { supabase } from '@/lib/supabase'
import type { Event } from '@/types'
import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { formatGatherTimeFor, isImminent, isEnded } from '@/lib/gather-time'
import { getLocale } from '@/lib/locale'
import { getAppSetting } from '@/lib/app-settings'
import { getSession } from '@/lib/session'
import HomeEventList, { type HomeEventCardData, type HomeEventKind } from '@/components/HomeEventList'
import DismissibleNoticeBanner from '@/components/DismissibleNoticeBanner'

// Homepage reflects the live DB, so never prerender at build — a static
// snapshot would show stale or deleted events.
export const dynamic = 'force-dynamic'

interface EventWithCounts extends Event {
  total: number
  assigned: number
}

async function getActiveEvents(): Promise<EventWithCounts[]> {
  const { data: events } = await supabase
    .from('events')
    .select('*')
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
  const { data: parties } = await supabase
    .from('parties')
    .select('event_id, slots(id, assigned_discord_id, is_hidden)')
    .in('event_id', ids)

  const totals = new Map<string, { total: number; assigned: number }>()
  for (const p of (parties ?? []) as { event_id: string; slots: { id: string; assigned_discord_id: string | null; is_hidden: boolean }[] | null }[]) {
    const current = totals.get(p.event_id) ?? { total: 0, assigned: 0 }
    const slots = (p.slots ?? []).filter((s) => !s.is_hidden)
    current.total += slots.length
    current.assigned += slots.filter((s) => s.assigned_discord_id).length
    totals.set(p.event_id, current)
  }

  return active.map((e) => ({
    ...e,
    total: totals.get(e.id)?.total ?? 0,
    assigned: totals.get(e.id)?.assigned ?? 0,
  }))
}

function classifyScheduled(event: Event): HomeEventKind {
  if (event.battle_started_at || isImminent(event.gather_at)) return 'imminent'
  return 'upcoming'
}

// Layout-level gate (src/app/layout.tsx) blocks non-members before this
// component runs — by the time HomePage renders, the viewer is a guild member.
export default async function HomePage() {
  const [t, locale, noticeMessage, session] = await Promise.all([
    getTranslations(),
    getLocale(),
    getAppSetting('events_notice_message', ''),
    getSession(),
  ])

  // Prefer gather_at (ISO) for locale-aware formatting; fall back to stored
  // gather_time (always Korean) for legacy rows that predate gather_at.
  const displayGatherTime = (event: Event): string =>
    event.gather_at ? formatGatherTimeFor(locale, event.gather_at) : event.gather_time

  const events = await getActiveEvents()

  const toCard = (event: EventWithCounts): HomeEventCardData => ({
    id: event.id,
    title: event.title,
    gather_location: event.gather_location,
    displayGatherTime: displayGatherTime(event),
    total: event.total,
    assigned: event.assigned,
    kind: classifyScheduled(event),
    battleStarted: !!event.battle_started_at,
  })

  const cards = events.map(toCard)

  return (
    <main className="flex-1 px-4 py-6 sm:py-8 max-w-3xl xl:max-w-6xl 2xl:max-w-7xl mx-auto w-full space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{t('home.title')}</h1>
          <p className="text-gray-400 text-sm">{t('home.subtitle')}</p>
        </div>
        {session?.canCreateEvents && (
          <Link
            href="/admin/dashboard/events/new"
            className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-3 py-2 rounded-lg transition-colors text-sm whitespace-nowrap"
          >
            <Plus size={16} />
            {t('home.newEvent')}
          </Link>
        )}
      </div>

      <DismissibleNoticeBanner storageKey="events" message={noticeMessage} />

      {events.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center">
          <p className="text-gray-400">{t('home.empty')}</p>
        </div>
      ) : (
        <HomeEventList events={cards} />
      )}
    </main>
  )
}
