import { getTranslations } from 'next-intl/server'
import { Swords, Skull, Trophy, Activity } from 'lucide-react'
import type { GuildWeeklyStats } from '@/lib/guild-weekly-stats'

interface Props {
  stats: GuildWeeklyStats
}

export default async function HomeGuildWeeklyStats({ stats }: Props) {
  const t = await getTranslations('home.weeklyStats')

  // 전투가 없는 주는 위젯 자체를 숨겨 빈 공간 만들지 않는다.
  if (stats.battleCount === 0) return null

  const winRatePercent =
    stats.battleCount > 0 ? Math.round((stats.winCount / stats.battleCount) * 100) : 0

  return (
    <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={14} className="text-amber-400" />
        <h2 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
          {t('title')}
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          icon={<Swords size={14} className="text-amber-400" />}
          label={t('battles')}
          value={stats.battleCount.toLocaleString()}
        />
        <Stat
          icon={<Trophy size={14} className="text-emerald-400" />}
          label={t('winRate')}
          value={`${winRatePercent}%`}
          sub={t('winLossSub', { wins: stats.winCount, losses: stats.lossCount })}
        />
        <Stat
          icon={<Swords size={14} className="text-emerald-400" />}
          label={t('kills')}
          value={stats.totalKills.toLocaleString()}
        />
        <Stat
          icon={<Skull size={14} className="text-rose-400" />}
          label={t('deaths')}
          value={stats.totalDeaths.toLocaleString()}
        />
      </div>
    </section>
  )
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-400 uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <p className="text-white text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-gray-500 text-[11px] font-mono">{sub}</p>}
    </div>
  )
}
