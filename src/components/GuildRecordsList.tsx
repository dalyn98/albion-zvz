'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Flag, ChevronRight, Trophy, ShieldAlert } from 'lucide-react'
import SearchBox from './SearchBox'
import { matchesName, normalizeQuery } from '@/lib/search-match'
import type { GuildRecord } from '@/app/actions/battle-records'

interface Props {
  records: GuildRecord[]
}

export default function GuildRecordsList({ records }: Props) {
  const t = useTranslations('battleRecords')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = normalizeQuery(search)
    return q ? records.filter((r) => matchesName(r.name, q)) : records
  }, [records, search])

  return (
    <div className="space-y-3">
      <SearchBox value={search} onChange={setSearch} placeholder={t('searchPlaceholder')} />
      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{t('noSearchResult')}</p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((r) => {
            const winRate = r.total > 0 ? Math.round((r.wins / r.total) * 100) : 0
            const disabled = !r.opponent_guild_id
            const classes = disabled
              ? 'flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 opacity-70'
              : 'flex items-center gap-3 bg-gray-900 border border-gray-800 hover:border-amber-500/40 rounded-lg px-4 py-3 transition-colors'
            const content = (
              <>
                <Flag size={18} className="text-amber-400 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-semibold truncate">
                    {r.name || t('unnamedGuild')}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-[11px]">
                    <span className="flex items-center gap-1 text-emerald-300">
                      <Trophy size={11} />
                      {r.wins}
                    </span>
                    <span className="flex items-center gap-1 text-rose-300">
                      <ShieldAlert size={11} />
                      {r.losses}
                    </span>
                    <span className="text-gray-500">
                      {t('winRate', { rate: winRate })}
                    </span>
                  </div>
                </div>
                {!disabled && <ChevronRight size={16} className="text-gray-600 flex-shrink-0" />}
              </>
            )
            if (disabled) {
              return (
                <li key={r.name}>
                  <div className={classes} title={t('legacyNotLinked')}>{content}</div>
                </li>
              )
            }
            return (
              <li key={r.opponent_guild_id}>
                <Link href={`/battle-records/${r.opponent_guild_id}`} className={classes}>
                  {content}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
