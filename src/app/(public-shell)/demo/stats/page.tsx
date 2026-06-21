import { getTranslations } from 'next-intl/server'
import { getLocale } from '@/lib/locale'
import {
  BarChart3,
  Wallet,
  TrendingUp,
  TrendingDown,
  Users,
} from 'lucide-react'
import {
  DEMO_POINT_STATS,
  DEMO_TOP_HOLDERS,
  DEMO_FINANCE_FLOW_STATS,
} from '@/data/demo-seed'
import CollapsibleList from '@/components/CollapsibleList'
import DemoGuidedTour from '../_components/DemoGuidedTour'
import DemoCTACard from '../_components/DemoCTACard'
import { DemoStatCard, MockAvatar, STATS_COLLAPSED_ROWS } from './_components/shared'
import WithdrawnMembersSection from './_components/WithdrawnMembersSection'
import EventParticipationSection from './_components/EventParticipationSection'
import ShopRegearSection from './_components/ShopRegearSection'
import AlbionVerificationSection from './_components/AlbionVerificationSection'
import FinanceFlowSection from './_components/FinanceFlowSection'

const STATS_TOUR_STEPS = [
  { id: 'stats-kpi' },
  { id: 'stats-holders' },
  { id: 'stats-finance' },
] as const

export default async function DemoStatsPage() {
  const [tNav, tStats, tCommon, tCta, locale] = await Promise.all([
    getTranslations('nav'),
    getTranslations('adminStats'),
    getTranslations('common'),
    getTranslations('demo.ctaCard'),
    getLocale(),
  ])

  const stats = DEMO_POINT_STATS
  const topHolders = DEMO_TOP_HOLDERS

  const cards = [
    {
      label: tStats('cardHeldTotalLabel'),
      value: stats.totalHeld,
      hint: tStats('cardHeldTotalHint', { count: stats.memberCount.toLocaleString() }),
      icon: Wallet,
      tone: 'accent' as const,
    },
    {
      label: tStats('cardLifetimeEarnedLabel'),
      value: stats.lifetimeEarned,
      hint: tStats('cardLifetimeEarnedHint', { count: stats.entriesCount.toLocaleString() }),
      icon: TrendingUp,
      tone: 'success' as const,
    },
    {
      label: tStats('cardLifetimeSpentLabel'),
      value: stats.lifetimeSpent,
      hint: tStats('cardLifetimeSpentHint'),
      icon: TrendingDown,
      tone: 'danger' as const,
    },
    {
      label: tStats('cardHoldersLabel'),
      value: topHolders.length,
      hint: tStats('cardHoldersHint', { total: stats.memberCount.toLocaleString() }),
      icon: Users,
      tone: 'info' as const,
    },
  ]

  return (
    <div className="space-y-6">
      <DemoGuidedTour steps={STATS_TOUR_STEPS} namespace="stats" />
      <div className="flex items-center gap-2">
        <BarChart3 size={22} className="text-amber-400" />
        <h1 className="text-2xl font-bold text-white">{tNav('stats')}</h1>
      </div>
      <p className="text-sm text-gray-400">{tStats('ledgerDescription')}</p>

      <div data-tour-id="stats-kpi" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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

      <section data-tour-id="stats-holders" className="bg-gray-900/60 border border-gray-700 rounded-lg">
        <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">{tStats('topHoldersTitle')}</h2>
          <span className="text-xs text-gray-500">Top {topHolders.length}</span>
        </header>
        {topHolders.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            {tStats('topHoldersEmpty')}
          </div>
        ) : (
          <CollapsibleList
            as="ol"
            className="divide-y divide-gray-800"
            initialCount={STATS_COLLAPSED_ROWS}
            unit="members"
          >
            {topHolders.map((h, idx) => (
              <li
                key={h.discordId}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800/40"
              >
                <span className="text-xs text-gray-500 font-mono w-6 text-right">{idx + 1}</span>
                <MockAvatar size={24} />
                <span className="flex-1 text-sm text-gray-200 truncate flex items-center gap-2 min-w-0">
                  <span className="truncate">{h.ign}</span>
                  {h.isAdmin && (
                    <span className="text-[10px] text-amber-400 border border-amber-500/40 rounded px-1 py-0.5 flex-shrink-0">
                      ADMIN
                    </span>
                  )}
                </span>
                <span className="text-sm font-mono text-amber-300 tabular-nums">
                  {h.balance.toLocaleString()}
                </span>
              </li>
            ))}
          </CollapsibleList>
        )}
      </section>

      <div data-tour-id="stats-finance">
        <FinanceFlowSection stats={DEMO_FINANCE_FLOW_STATS} tStats={tStats} />
      </div>
      <AlbionVerificationSection tStats={tStats} tCommon={tCommon} />
      <EventParticipationSection tStats={tStats} />
      <ShopRegearSection tStats={tStats} locale={locale} />
      <WithdrawnMembersSection
        withdrawnHeld={stats.withdrawnHeld}
        withdrawnHolders={stats.withdrawnHolders}
        tStats={tStats}
      />

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta('stats.title')}
        description={tCta('stats.description')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}
