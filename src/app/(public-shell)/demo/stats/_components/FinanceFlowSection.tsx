import {
  TrendingUp,
  TrendingDown,
  LineChart,
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-react'
import type { DemoFinanceFlowStats } from '@/data/demo-seed'
import { reasonLabel, type StatsTranslator } from './shared'

export default function FinanceFlowSection({
  stats,
  tStats,
}: {
  stats: DemoFinanceFlowStats
  tStats: StatsTranslator
}) {
  const netAccent = stats.netFlow >= 0 ? 'text-emerald-300' : 'text-rose-300'
  const netRing = stats.netFlow >= 0 ? 'border-emerald-500/30' : 'border-rose-500/30'
  const netBg = stats.netFlow >= 0 ? 'bg-emerald-500/5' : 'bg-rose-500/5'
  const netIcon = stats.netFlow >= 0 ? ArrowUpRight : ArrowDownRight

  const cards = [
    {
      label: tStats('financeEarnedLabel', { days: stats.windowDays }),
      value: stats.totalEarned,
      hint: tStats('financeEarnedHint'),
      icon: TrendingUp,
      accent: 'text-emerald-300',
      ring: 'border-emerald-500/30',
      bg: 'bg-emerald-500/5',
    },
    {
      label: tStats('financeSpentLabel', { days: stats.windowDays }),
      value: stats.totalSpent,
      hint: tStats('financeSpentHint'),
      icon: TrendingDown,
      accent: 'text-rose-300',
      ring: 'border-rose-500/30',
      bg: 'bg-rose-500/5',
    },
    {
      label: tStats('financeNetLabel', { days: stats.windowDays }),
      value: stats.netFlow,
      hint: stats.netFlow >= 0 ? tStats('financeNetPositive') : tStats('financeNetNegative'),
      icon: netIcon,
      accent: netAccent,
      ring: netRing,
      bg: netBg,
    },
  ]

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <LineChart size={18} className="text-amber-300" />
        <h2 className="text-lg font-semibold text-white">
          {tStats('financeTitle', { days: stats.windowDays })}
        </h2>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">{tStats('financeDescription')}</p>

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
                {card.value.toLocaleString()}
              </div>
              <div className="text-[11px] text-gray-500">{card.hint}</div>
            </div>
          )
        })}
      </div>

      <FinanceDailyChart daily={stats.daily} tStats={tStats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ReasonBreakdownList
          title={tStats('financeSourcesTitle')}
          total={stats.totalEarned}
          items={stats.sources}
          accent="text-emerald-300"
          barColor="bg-emerald-500/60"
          emptyLabel={tStats('financeSourcesEmpty')}
          tStats={tStats}
        />
        <ReasonBreakdownList
          title={tStats('financeSinksTitle')}
          total={stats.totalSpent}
          items={stats.sinks}
          accent="text-rose-300"
          barColor="bg-rose-500/60"
          emptyLabel={tStats('financeSinksEmpty')}
          tStats={tStats}
        />
      </div>
    </section>
  )
}

function FinanceDailyChart({
  daily,
  tStats,
}: {
  daily: DemoFinanceFlowStats['daily']
  tStats: StatsTranslator
}) {
  const peak = daily.reduce((m, d) => Math.max(m, d.earned, d.spent), 0)
  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded-lg p-4">
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">{tStats('financeDailyTitle')}</h3>
        <div className="flex items-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 bg-emerald-500/70 rounded-sm" />{' '}
            {tStats('financeEarnedLegend')}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 bg-rose-500/70 rounded-sm" />{' '}
            {tStats('financeSpentLegend')}
          </span>
        </div>
      </header>
      {peak === 0 ? (
        <p className="text-gray-500 text-xs text-center py-6">{tStats('financeDailyEmpty')}</p>
      ) : (
        <div className="flex items-end gap-[3px] h-28">
          {daily.map((d) => {
            const earnedH = (d.earned / peak) * 100
            const spentH = (d.spent / peak) * 100
            return (
              <div
                key={d.date}
                className="flex-1 flex items-end gap-[1px] min-w-[6px] h-full"
                title={`${d.date} · +${d.earned.toLocaleString()} / -${d.spent.toLocaleString()}`}
              >
                <div
                  className="flex-1 bg-emerald-500/70"
                  style={{
                    height: `${earnedH}%`,
                    minHeight: d.earned > 0 ? '2px' : '0',
                  }}
                />
                <div
                  className="flex-1 bg-rose-500/70"
                  style={{
                    height: `${spentH}%`,
                    minHeight: d.spent > 0 ? '2px' : '0',
                  }}
                />
              </div>
            )
          })}
        </div>
      )}
      <div className="flex items-center justify-between text-[10px] text-gray-500 mt-2 font-mono">
        <span>{daily[0]?.date ?? ''}</span>
        <span>{daily[daily.length - 1]?.date ?? ''}</span>
      </div>
    </div>
  )
}

function ReasonBreakdownList({
  title,
  total,
  items,
  accent,
  barColor,
  emptyLabel,
  tStats,
}: {
  title: string
  total: number
  items: DemoFinanceFlowStats['sources']
  accent: string
  barColor: string
  emptyLabel: string
  tStats: StatsTranslator
}) {
  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded-lg">
      <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <span className={`text-xs font-mono tabular-nums ${accent}`}>
          {tStats('financeTotalPoints', { total: total.toLocaleString() })}
        </span>
      </header>
      {items.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-500">{emptyLabel}</div>
      ) : (
        <ul className="divide-y divide-gray-800">
          {items.map((item) => {
            const pct = total > 0 ? Math.round((item.total / total) * 1000) / 10 : 0
            return (
              <li key={item.reason} className="px-4 py-2 space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-gray-200 truncate">{reasonLabel(item.reason, tStats)}</span>
                  <span className={`font-mono tabular-nums ${accent}`}>
                    {item.total.toLocaleString()}p
                    <span className="ml-2 text-gray-500">· {pct}%</span>
                  </span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[10px] text-gray-500 font-mono">
                  {tStats('financeEntryCount', { count: item.count.toLocaleString() })}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
