import { CalendarCheck, UserCheck, Users } from 'lucide-react'
import { getEventStats } from '@/app/actions/stats-admin'
import type { StatsTranslator } from './shared'

export default async function EventParticipationSection({
  tStats,
}: {
  tStats: StatsTranslator
}) {
  const { stats, error } = await getEventStats()
  if (error || !stats) {
    return (
      <section className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 text-sm text-red-300">
        {tStats('eventLoadError')}: {error ?? tStats('unknownError')}
      </section>
    )
  }

  const ratePercent = Math.round(stats.participationRate * 1000) / 10 // 소수 1자리.
  const previousRatePercent = Math.round(stats.previousParticipationRate * 1000) / 10
  const cards = [
    {
      label: tStats('eventCardEventsLabel', { days: stats.windowDays }),
      value: stats.totalEvents,
      hint: tStats('eventCardEventsHint'),
      comparison: eventCountComparison(stats.totalEvents, stats.previousTotalEvents, tStats),
      icon: CalendarCheck,
      accent: 'text-indigo-300',
      ring: 'border-indigo-500/30',
      bg: 'bg-indigo-500/5',
    },
    {
      label: tStats('eventCardActiveLabel'),
      value: stats.activeMembers,
      hint: tStats('eventCardActiveHint', { total: stats.totalMembers.toLocaleString() }),
      comparison: eventCountComparison(stats.activeMembers, stats.previousActiveMembers, tStats),
      icon: UserCheck,
      accent: 'text-emerald-300',
      ring: 'border-emerald-500/30',
      bg: 'bg-emerald-500/5',
    },
    {
      label: tStats('eventCardRateLabel'),
      value: `${ratePercent.toLocaleString()}%`,
      hint: tStats('eventCardRateHint'),
      comparison: tStats('eventRateComparison', {
        previous: previousRatePercent.toLocaleString(),
        change: signedNumber(Math.round((ratePercent - previousRatePercent) * 10) / 10),
      }),
      icon: Users,
      accent: 'text-sky-300',
      ring: 'border-sky-500/30',
      bg: 'bg-sky-500/5',
    },
  ]

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarCheck size={18} className="text-indigo-300" />
        <h2 className="text-lg font-semibold text-white">
          {tStats('eventTitle', { days: stats.windowDays })}
        </h2>
      </div>
      <p className="text-xs text-gray-500">
        {tStats('eventCohortLabel', { count: stats.totalMembers.toLocaleString() })}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className={`${card.bg} ${card.ring} border rounded-lg p-4 space-y-2`}
            >
              <div className="flex items-center gap-2">
                <Icon size={16} className={card.accent} />
                <span className="text-xs text-gray-300">{card.label}</span>
              </div>
              <div className={`text-2xl font-bold font-mono ${card.accent}`}>
                {typeof card.value === 'number' ? card.value.toLocaleString() : card.value}
              </div>
              <div className="text-[11px] text-gray-500">{card.hint}</div>
              <div className="border-t border-white/5 pt-2 text-[10px] text-gray-400">
                {card.comparison}
              </div>
            </div>
          )
        })}
      </div>
      <p className="rounded-lg border border-gray-800 bg-gray-950/40 px-4 py-3 text-xs leading-relaxed text-gray-500">
        {tStats('eventNoIndividualRanking')}
      </p>
    </section>
  )
}

function eventCountComparison(
  current: number,
  previous: number,
  tStats: StatsTranslator,
): string {
  return tStats('eventCountComparison', {
    previous: previous.toLocaleString(),
    change: signedNumber(current - previous),
  })
}

function signedNumber(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toLocaleString()}`
}
