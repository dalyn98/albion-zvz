import { supabase } from '@/lib/supabase'
import type { Event } from '@/types'
import { getTranslations } from 'next-intl/server'
import { formatGatherTimeFor, isImminent, isEnded } from '@/lib/gather-time'
import { getLocale } from '@/lib/locale'
import HomeEventTabs, { type HomeEventCardData, type HomeEventKind } from '@/components/HomeEventTabs'

// Homepage reflects the live DB, so never prerender at build — a static
// snapshot would show stale or deleted events.
export const dynamic = 'force-dynamic'

interface EventWithCounts extends Event {
  total: number
  assigned: number
}

// Scheduled kinds only; wins/losses are determined by event.outcome directly.
type ScheduledKind = 'imminent' | 'ended' | 'upcoming'

async function getActiveEvents(): Promise<EventWithCounts[]> {
  const { data: events } = await supabase
    .from('events')
    .select('*')
    .order('gather_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (!events || events.length === 0) return []

  const ids = (events as Event[]).map((e) => e.id)
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

  return (events as Event[]).map((e) => ({
    ...e,
    total: totals.get(e.id)?.total ?? 0,
    assigned: totals.get(e.id)?.assigned ?? 0,
  }))
}

function classifyScheduled(event: Event): ScheduledKind {
  if (event.battle_started_at && isEnded(event.battle_started_at)) return 'ended'
  if (event.battle_started_at || isImminent(event.gather_at)) return 'imminent'
  return 'upcoming'
}

// Layout-level gate (src/app/layout.tsx) blocks non-members before this
// component runs — by the time HomePage renders, the viewer is a guild member.
export default async function HomePage() {
  const [t, locale] = await Promise.all([
    getTranslations(),
    getLocale(),
  ])

  // Prefer gather_at (ISO) for locale-aware formatting; fall back to stored
  // gather_time (always Korean) for legacy rows that predate gather_at.
  const displayGatherTime = (event: Event): string =>
    event.gather_at ? formatGatherTimeFor(locale, event.gather_at) : event.gather_time

  const events = await getActiveEvents()

  // Fetch opponent guild summaries for finalized events so the win/loss tabs
  // can display "vs GuildA, GuildB · 3 battles" per card. Skip when there are
  // no finalized events.
  const finalizedIds = events.filter((e) => e.outcome).map((e) => e.id)
  const battleMap = new Map<string, { opponents: string[]; count: number }>()
  if (finalizedIds.length > 0) {
    const { data: battles } = await supabase
      .from('event_battles')
      .select('event_id, opponent_guild, battle_number')
      .in('event_id', finalizedIds)
      .order('battle_number', { ascending: true })
    for (const b of (battles ?? []) as { event_id: string; opponent_guild: string }[]) {
      const cur = battleMap.get(b.event_id) ?? { opponents: [], count: 0 }
      if (!cur.opponents.includes(b.opponent_guild)) cur.opponents.push(b.opponent_guild)
      cur.count += 1
      battleMap.set(b.event_id, cur)
    }
  }

  const toCard = (event: EventWithCounts, kind: HomeEventKind): HomeEventCardData => {
    const battleInfo = battleMap.get(event.id)
    return {
      id: event.id,
      title: event.title,
      gather_location: event.gather_location,
      displayGatherTime: displayGatherTime(event),
      total: event.total,
      assigned: event.assigned,
      kind,
      battleStarted: !!event.battle_started_at,
      opponentGuilds: battleInfo ? battleInfo.opponents.join(', ') : null,
      battleCount: battleInfo?.count ?? 0,
    }
  }

  const scheduled: HomeEventCardData[] = []
  const wins: HomeEventCardData[] = []
  const losses: HomeEventCardData[] = []
  for (const e of events) {
    if (e.outcome === 'win') wins.push(toCard(e, 'win'))
    else if (e.outcome === 'loss') losses.push(toCard(e, 'loss'))
    else scheduled.push(toCard(e, classifyScheduled(e)))
  }

  return (
    <main className="flex-1 px-4 py-6 sm:py-8 max-w-3xl xl:max-w-6xl 2xl:max-w-7xl mx-auto w-full space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">{t('home.title')}</h1>
        <p className="text-gray-400 text-sm">{t('home.subtitle')}</p>
      </div>

      {events.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center">
          <p className="text-gray-400">{t('home.empty')}</p>
        </div>
      ) : (
        <HomeEventTabs scheduled={scheduled} wins={wins} losses={losses} />
      )}
    </main>
  )
}
