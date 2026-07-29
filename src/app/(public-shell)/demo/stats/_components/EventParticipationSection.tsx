import { CalendarCheck, UserCheck, Users } from 'lucide-react'
import { DEMO_EVENT_STATS } from '@/data/demo-seed'
import {
  DemoStatCard,
  type StatsTranslator,
} from './shared'

export default function EventParticipationSection({
  tStats,
}: {
  tStats: StatsTranslator
}) {
  const stats = DEMO_EVENT_STATS
  const ratePercent = Math.round(stats.participationRate * 1000) / 10

  const cards = [
    {
      label: tStats('eventCardEventsLabel', { days: stats.windowDays }),
      value: stats.totalEvents,
      hint: tStats('eventCardEventsHint'),
      icon: CalendarCheck,
      tone: 'info' as const,
    },
    {
      label: tStats('eventCardActiveLabel'),
      value: stats.activeMembers,
      hint: tStats('eventCardActiveHint', { total: stats.totalMembers.toLocaleString() }),
      icon: UserCheck,
      tone: 'success' as const,
    },
    {
      label: tStats('eventCardRateLabel'),
      value: `${ratePercent.toLocaleString()}%`,
      hint: tStats('eventCardRateHint'),
      icon: Users,
      tone: 'accent' as const,
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {cards.map((card) => {
          return (
            <DemoStatCard
              key={card.label}
              icon={card.icon}
              label={card.label}
              value={card.value}
              hint={card.hint}
              tone={card.tone}
            />
          )
        })}
      </div>

      <p className="rounded-lg border border-gray-800 bg-gray-950/40 px-4 py-3 text-xs leading-relaxed text-gray-500">
        {tStats('eventNoIndividualRanking')}
      </p>
    </section>
  )
}
