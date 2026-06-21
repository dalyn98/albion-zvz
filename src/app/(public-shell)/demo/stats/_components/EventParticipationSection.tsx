import { CalendarCheck, UserCheck, Users } from 'lucide-react'
import { DEMO_EVENT_STATS } from '@/data/demo-seed'
import CollapsibleList from '@/components/CollapsibleList'
import {
  DemoStatCard,
  MockAvatar,
  STATS_COLLAPSED_ROWS,
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

      <div className="bg-gray-900/60 border border-gray-700 rounded-lg">
        <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">{tStats('topAttendeesTitle')}</h3>
          <span className="text-xs text-gray-500">Top {stats.topAttendees.length}</span>
        </header>
        {stats.topAttendees.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            {tStats('topAttendeesEmpty')}
          </div>
        ) : (
          <CollapsibleList
            as="ol"
            className="divide-y divide-gray-800"
            initialCount={STATS_COLLAPSED_ROWS}
            unit="members"
          >
            {stats.topAttendees.map((a, idx) => (
              <li
                key={a.discordId}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800/40"
              >
                <span className="text-xs text-gray-500 font-mono w-6 text-right">{idx + 1}</span>
                <MockAvatar size={24} />
                <span className="flex-1 text-sm text-gray-200 truncate flex items-center gap-2 min-w-0">
                  <span className="truncate">{a.ign}</span>
                  {a.isAdmin && (
                    <span className="text-[10px] text-amber-400 border border-amber-500/40 rounded px-1 py-0.5 flex-shrink-0">
                      ADMIN
                    </span>
                  )}
                </span>
                <span className="text-sm font-mono text-indigo-300 tabular-nums">
                  {tStats('eventCountUnit', { count: a.eventCount.toLocaleString() })}
                </span>
              </li>
            ))}
          </CollapsibleList>
        )}
      </div>
    </section>
  )
}
