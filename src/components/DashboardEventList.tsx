'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { Pencil, Swords, Flame, Archive } from 'lucide-react'
import DeleteEventButton from './DeleteEventButton'
import InlineBattleStartButton from './InlineBattleStartButton'
import NotifyEventButton from './NotifyEventButton'
import SearchBox from './SearchBox'
import { matchesDate, matchesName, normalizeQuery } from '@/lib/search-match'
import { formatGatherTimeFor, isEnded, isImminent } from '@/lib/gather-time'
import type { Event } from '@/types'
import type { Locale } from '@/i18n/locales'

export default function DashboardEventList({ events }: { events: Event[] }) {
  const t = useTranslations('adminDashboard')
  const tCommon = useTranslations('common')
  const locale = useLocale() as Locale
  const [search, setSearch] = useState('')
  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return events
    // Search across title + gather_at/created_at. Using both dates so admins
    // can find events by either their battle date or creation date.
    return events.filter(
      (e) =>
        matchesName(e.title, q) ||
        matchesDate(e.gather_at, q) ||
        matchesDate(e.created_at, q),
    )
  }, [events, search])

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">{tCommon('searchNoResults')}</p>
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
                <DeleteEventButton eventId={event.id} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
