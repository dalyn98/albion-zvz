import { getTranslations } from 'next-intl/server'
import { Trophy, ShieldAlert, Flag, CalendarRange } from 'lucide-react'
import type { GuildAggregateStats } from '@/app/actions/members-admin'

interface Props {
  stats: GuildAggregateStats
}

function formatRangeLabel(start: string, end: string, allTimeLabel: string): string {
  if (!start && !end) return allTimeLabel
  if (start && end) return `${start} ~ ${end}`
  if (start) return `${start} ~`
  return `~ ${end}`
}

export default async function GuildAggregateHeader({ stats }: Props) {
  const t = await getTranslations('members')
  const rangeLabel = formatRangeLabel(stats.startDate, stats.endDate, t('aggregateAllTime'))

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
        <CalendarRange size={12} className="text-amber-400" />
        <span>{t('aggregateRange')}:</span>
        <span className="text-gray-300">{rangeLabel}</span>
      </div>
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-1.5">
          <Trophy size={14} className="text-emerald-300" />
          <span className="text-xs text-gray-400">{t('aggregateWins')}</span>
          <span className="text-base font-bold text-emerald-300 font-mono">{stats.wins}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <ShieldAlert size={14} className="text-rose-300" />
          <span className="text-xs text-gray-400">{t('aggregateLosses')}</span>
          <span className="text-base font-bold text-rose-300 font-mono">{stats.losses}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Flag size={14} className="text-amber-400" />
          <span className="text-xs text-gray-400">{t('aggregateOpponents')}</span>
          <span className="text-base font-bold text-amber-300 font-mono">
            {stats.distinctOpponents}
          </span>
        </div>
      </div>
    </div>
  )
}
