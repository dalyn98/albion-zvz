import { getTranslations } from 'next-intl/server'
import { Swords, Skull, Trophy, Activity } from 'lucide-react'
import type { GuildWeeklyStats } from '@/lib/guild-weekly-stats'
import { ACCENT_CLASS_MAP } from '@/lib/guild-profile'
import { SectionCard, ValueDisplay } from '@/components/ui-patterns'

interface Props {
  stats: GuildWeeklyStats
  accent: (typeof ACCENT_CLASS_MAP)[keyof typeof ACCENT_CLASS_MAP]
}

// 길드 공개 페이지 (`/g/<slug>`) "활동" 섹션의 이번 주 KPI 줄. 홈 페이지에 있던
// 위젯을 길드 공개 페이지 톤(액센트 + glass 카드)에 맞춰 재구성. 데이터 소스는
// 동일한 loadGuildWeeklyStats — /battles 와 같은 low-engagement 컷 + bundle_split
// 토글이 적용된 "이번 주 (PT 월요일 00:00~)" 집계.
//
// 전투가 0 인 주는 위젯 자체를 숨겨 빈 공간 만들지 않는다 — 활동 섹션에 다른
// 카드(최근 전투/탑 킬러)가 없을 때만 의미가 있을 수 있는데, 페이지 상위에서
// hasActivity 로 묶어 처리하므로 여기서 단순 null 반환.
export default async function GuildPublicWeeklyStats({ stats, accent }: Props) {
  const t = await getTranslations('publicGuildProfile')

  if (stats.battleCount === 0) return null

  const winRatePercent =
    stats.battleCount > 0 ? Math.round((stats.winCount / stats.battleCount) * 100) : 0

  return (
    <SectionCard
      className={`border ${accent.border} bg-gray-900/40 shadow-none backdrop-blur-sm transition-colors hover:bg-gray-900/60`}
    >
      <div className="flex items-center gap-2 mb-4">
        <Activity size={14} className={accent.heading} />
        <h3
          className={`text-xs font-bold uppercase tracking-[0.25em] ${accent.heading}`}
        >
          {t('weeklyStatsLabel')}
        </h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6">
        <Stat
          icon={<Swords size={14} className={accent.heading} />}
          label={t('weeklyStatsBattles')}
          value={stats.battleCount.toLocaleString('en-US')}
        />
        <Stat
          icon={<Trophy size={14} className="text-emerald-300" />}
          label={t('weeklyStatsWinRate')}
          value={`${winRatePercent}%`}
          sub={t('weeklyStatsWinLossSub', {
            wins: stats.winCount,
            losses: stats.lossCount,
          })}
        />
        <Stat
          icon={<Swords size={14} className="text-emerald-300" />}
          label={t('weeklyStatsKills')}
          value={stats.totalKills.toLocaleString('en-US')}
        />
        <Stat
          icon={<Skull size={14} className="text-rose-300" />}
          label={t('weeklyStatsDeaths')}
          value={stats.totalDeaths.toLocaleString('en-US')}
        />
      </div>
    </SectionCard>
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
    <ValueDisplay iconNode={icon} label={label} value={value} detail={sub} size="md" />
  )
}
