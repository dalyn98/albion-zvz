'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Clock, MapPin, ChevronRight, Users } from 'lucide-react'
import SearchBox from './SearchBox'
import { matchesDate, matchesName, normalizeQuery } from '@/lib/search-match'

export interface ArchivedEventCard {
  id: string
  title: string
  gather_location: string
  gatherDisplay: string
  battleStartedAt: string | null
  battleStartedDisplay: string | null
  total: number
  assigned: number
  searchDate: string | null
}

export default function ArchiveEventList({ events }: { events: ArchivedEventCard[] }) {
  const t = useTranslations('archive')
  const tCommon = useTranslations('common')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    if (!q) return events
    return events.filter(
      (e) =>
        matchesName(e.title, q) ||
        matchesName(e.gather_location, q) ||
        (e.searchDate ? matchesDate(e.searchDate, q) : false),
    )
  }, [events, search])

  return (
    <div className="space-y-4">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center">
          <p className="text-gray-400">{search ? tCommon('searchNoResults') : t('empty')}</p>
        </div>
      ) : (
        <ul className="space-y-3 xl:grid xl:grid-cols-2 xl:gap-3 xl:space-y-0 2xl:grid-cols-3">
          {filtered.map((e) => (
            <li key={e.id}>
              <Link
                href={`/events/${e.id}`}
                className="group block bg-gradient-to-br from-gray-900/80 to-gray-900/40 backdrop-blur-sm border border-gray-800/80 hover:border-gray-700 rounded-2xl p-4 sm:p-5 transition-all duration-200 hover:-translate-y-0.5 opacity-80 hover:opacity-100"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-2">
                    <h2 className="text-base sm:text-lg font-bold text-white truncate">{e.title}</h2>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      <div className="flex items-center gap-1.5 text-gray-300">
                        <Clock size={13} className="text-amber-400" />
                        {e.gatherDisplay}
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-300">
                        <MapPin size={13} className="text-amber-400" />
                        {e.gather_location}
                      </div>
                    </div>
                    {e.total > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <Users size={12} />
                        {t('applicants', { assigned: e.assigned, total: e.total })}
                      </div>
                    )}
                    {e.battleStartedDisplay && (
                      <p className="text-[11px] text-gray-500 font-mono">
                        {t('battleStartedAt', { when: e.battleStartedDisplay })}
                      </p>
                    )}
                  </div>
                  <ChevronRight
                    size={20}
                    className="text-gray-500 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1"
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
