'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { Pencil, Swords, Flame, Archive, Activity } from 'lucide-react'
import DeleteEventButton from './DeleteEventButton'
import DuplicateEventButton from './DuplicateEventButton'
import InlineBattleStartButton from './InlineBattleStartButton'
import NotifyEventButton from './NotifyEventButton'
import SearchBox from './SearchBox'
import { matchesDate, matchesName, normalizeQuery } from '@/lib/search-match'
import { formatGatherTimeFor, isEnded, isImminent } from '@/lib/gather-time'
import type { Event } from '@/types'
import type { Locale } from '@/i18n/locales'

type TabKey = 'active' | 'ended'

const DEFAULT_TAB: TabKey = 'active'

function isTabKey(value: string | null): value is TabKey {
  return value === 'active' || value === 'ended'
}

function isEventEnded(event: Event): boolean {
  if (event.finalized_at) return true
  if (event.battle_started_at && isEnded(event.battle_started_at)) return true
  return false
}

export default function DashboardEventList({ events }: { events: Event[] }) {
  const t = useTranslations('adminDashboard')
  const tCommon = useTranslations('common')
  const locale = useLocale() as Locale
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [search, setSearch] = useState('')

  const rawTab = searchParams.get('tab')
  const activeTab: TabKey = isTabKey(rawTab) ? rawTab : DEFAULT_TAB

  const { activeEvents, endedEvents } = useMemo(() => {
    const active: Event[] = []
    const ended: Event[] = []
    for (const event of events) {
      if (isEventEnded(event)) ended.push(event)
      else active.push(event)
    }
    return { activeEvents: active, endedEvents: ended }
  }, [events])

  const tabEvents = activeTab === 'active' ? activeEvents : endedEvents
  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return tabEvents
    // Search across title + gather_at/created_at. Using both dates so admins
    // can find events by either their battle date or creation date.
    return tabEvents.filter(
      (e) =>
        matchesName(e.title, q) ||
        matchesDate(e.gather_at, q) ||
        matchesDate(e.created_at, q),
    )
  }, [tabEvents, search])

  const selectTab = (next: TabKey) => {
    if (next === activeTab) return
    const params = new URLSearchParams(searchParams.toString())
    if (next === DEFAULT_TAB) params.delete('tab')
    else params.set('tab', next)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const tabs: Array<{
    key: TabKey
    labelKey: 'tabActive' | 'tabEnded'
    icon: React.ComponentType<{ size?: number; className?: string }>
    count: number
  }> = [
    { key: 'active', labelKey: 'tabActive', icon: Activity, count: activeEvents.length },
    { key: 'ended', labelKey: 'tabEnded', icon: Archive, count: endedEvents.length },
  ]

  const emptyKey = activeTab === 'active' ? 'noActiveEvents' : 'noEndedEvents'

  return (
    <div className="space-y-4">
      <nav
        role="tablist"
        aria-label={t('tabsLabel')}
        className="flex gap-1 border-b border-gray-800 overflow-x-auto"
      >
        {tabs.map(({ key, labelKey, icon: Icon, count }) => {
          const isActive = activeTab === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                isActive
                  ? 'text-amber-300 border-amber-400'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <Icon size={14} />
              {t(labelKey)}
              <span className="text-[11px] text-gray-500 font-mono">{count}</span>
            </button>
          )
        })}
      </nav>

      <div role="tabpanel" className="space-y-3">
        <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
        {filtered.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">
            {search ? tCommon('searchNoResults') : t(emptyKey)}
          </p>
        ) : (
          <div className="space-y-3">
            {filtered.map((event) => (
              <div
                key={event.id}
                className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h2 className="font-bold text-white truncate">{event.title}</h2>
                    {event.battle_started_at && isEnded(event.battle_started_at) ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                        <Archive size={10} />
                        {t('badgeEnded')}
                      </span>
                    ) : event.battle_started_at ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                        <Swords size={10} />
                        {t('badgeBattleActive')}
                      </span>
                    ) : isImminent(event.gather_at) ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/40">
                        <Flame size={10} />
                        {t('badgeImminent')}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-gray-400 text-sm truncate">
                    {event.gather_at ? formatGatherTimeFor(locale, event.gather_at) : event.gather_time} · {event.gather_location}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:flex-shrink-0">
                  <InlineBattleStartButton eventId={event.id} battleStartedAt={event.battle_started_at} />
                  <NotifyEventButton eventId={event.id} />
                  <Link
                    href={`/admin/dashboard/events/${event.id}`}
                    className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                    aria-label={tCommon('edit')}
                  >
                    <Pencil size={15} />
                  </Link>
                  <DuplicateEventButton eventId={event.id} />
                  <DeleteEventButton eventId={event.id} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
