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
  getPointStats,
  getEventStats,
  getShopRegearStats,
  getAlbionVerificationStats,
  getFinanceFlowStats,
} from '@/app/actions/stats-admin'
import MemberAvatar from '@/components/MemberAvatar'
import MemberLink from '@/components/MemberLink'
import CollapsibleList from '@/components/CollapsibleList'
import { STATS_COLLAPSED_ROWS } from './_components/shared'
import WithdrawnMembersSection from './_components/WithdrawnMembersSection'
import EventParticipationSection from './_components/EventParticipationSection'
import ShopRegearSection from './_components/ShopRegearSection'
import AlbionVerificationSection from './_components/AlbionVerificationSection'
import FinanceFlowSection from './_components/FinanceFlowSection'

export const dynamic = 'force-dynamic'

export default async function AdminStatsPage() {
  // 다섯 섹션을 병렬로 — 하나가 느려도 다른 섹션이 블로킹되지 않도록.
  const [
    tNav,
    tStats,
    tCommon,
    locale,
    pointRes,
    eventRes,
    shopRegearRes,
    verificationRes,
    financeRes,
  ] = await Promise.all([
    getTranslations('nav'),
    getTranslations('adminStats'),
    getTranslations('common'),
    getLocale(),
    getPointStats(),
    getEventStats(),
    getShopRegearStats(),
    getAlbionVerificationStats(),
    getFinanceFlowStats(),
  ])

  const { stats, error } = pointRes

  if (error || !stats) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">{tNav('stats')}</h1>
        <div className="bg-red-500/10 border border-red-500/40 text-red-200 rounded-lg p-4 text-sm">
          {tStats('loadError')}: {error ?? tStats('unknownError')}
        </div>
      </div>
    )
  }

  // 부채(총 보유 포인트) 대비 누적 상황을 한눈에 보이게 지표 4개로 구성.
  // 추후 상점/이벤트 지표도 여기에 쌓아 나간다.
  const cards = [
    {
      label: tStats('cardHeldTotalLabel'),
      value: stats.totalHeld,
      hint: tStats('cardHeldTotalHint', { count: stats.memberCount.toLocaleString() }),
      icon: Wallet,
      accent: 'text-amber-400',
      ring: 'border-amber-500/30',
      bg: 'bg-amber-500/5',
    },
    {
      label: tStats('cardLifetimeEarnedLabel'),
      value: stats.lifetimeEarned,
      hint: tStats('cardLifetimeEarnedHint', { count: stats.entriesCount.toLocaleString() }),
      icon: TrendingUp,
      accent: 'text-emerald-400',
      ring: 'border-emerald-500/30',
      bg: 'bg-emerald-500/5',
    },
    {
      label: tStats('cardLifetimeSpentLabel'),
      value: stats.lifetimeSpent,
      hint: tStats('cardLifetimeSpentHint'),
      icon: TrendingDown,
      accent: 'text-rose-400',
      ring: 'border-rose-500/30',
      bg: 'bg-rose-500/5',
    },
    {
      label: tStats('cardHoldersLabel'),
      value: stats.topHolders.length,
      hint: tStats('cardHoldersHint', { total: stats.memberCount.toLocaleString() }),
      icon: Users,
      accent: 'text-sky-400',
      ring: 'border-sky-500/30',
      bg: 'bg-sky-500/5',
    },
  ]

  return (
    <div className="space-y-6" data-v2-page="stats">
      <header className="space-y-2" data-v2-page-header>
        <div className="flex items-center gap-2">
          <BarChart3 size={22} className="text-amber-400" data-v2-page-icon />
          <h1 className="text-2xl font-bold text-white" data-v2-page-title>{tNav('stats')}</h1>
        </div>
        <div data-v2-only className="game-divider" aria-hidden="true">
          <span className="game-divider-diamond" />
        </div>
        <p className="text-sm text-gray-400" data-v2-page-lede>{tStats('ledgerDescription')}</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" data-v2-grid="kpi">
        {cards.map((card, idx) => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className={`${card.bg} ${card.ring} border rounded-lg p-4 space-y-2`}
              data-v2-card={idx === 0 ? 'kpi-hero' : 'kpi'}
            >
              <div className="flex items-center gap-2">
                <Icon size={16} className={card.accent} />
                <span className="text-xs text-gray-300" data-v2-card-label>{card.label}</span>
              </div>
              <div className={`text-2xl font-bold font-mono ${card.accent}`} data-v2-card-value>
                {card.value.toLocaleString()}
              </div>
              <div className="text-[11px] text-gray-500" data-v2-card-hint>{card.hint}</div>
            </div>
          )
        })}
      </div>

      <section className="bg-gray-900/60 border border-gray-700 rounded-lg" data-v2-section="top-holders">
        <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between" data-v2-section-header>
          <h2 className="text-sm font-semibold text-white" data-v2-section-title>{tStats('topHoldersTitle')}</h2>
          <span className="text-xs text-gray-500" data-v2-section-meta>Top {stats.topHolders.length}</span>
        </header>
        {stats.topHolders.length === 0 ? (
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
            {stats.topHolders.map((h, idx) => (
              <li
                key={h.discordId}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800/40"
                data-v2-row="holder"
                data-v2-rank={idx + 1}
              >
                <span className="text-xs text-gray-500 font-mono w-6 text-right" data-v2-rank-badge>{idx + 1}</span>
                <MemberAvatar discordId={h.discordId} avatar={h.avatar} size={24} />
                <span className="flex-1 text-sm text-gray-200 truncate flex items-center gap-2 min-w-0">
                  <MemberLink
                    discordId={h.discordId}
                    username={h.username}
                    className="truncate"
                  />
                  {h.isAdmin && (
                    <span className="text-[10px] text-amber-400 border border-amber-500/40 rounded px-1 py-0.5 flex-shrink-0" data-v2-badge="admin">
                      ADMIN
                    </span>
                  )}
                </span>
                <span className="text-sm font-mono text-amber-300 tabular-nums" data-v2-holder-balance>
                  {h.balance.toLocaleString()}
                </span>
              </li>
            ))}
          </CollapsibleList>
        )}
      </section>

      <FinanceFlowSection result={financeRes} tStats={tStats} />
      <AlbionVerificationSection result={verificationRes} tStats={tStats} tCommon={tCommon} />
      <EventParticipationSection result={eventRes} tStats={tStats} />
      <ShopRegearSection result={shopRegearRes} tStats={tStats} locale={locale} />
      <WithdrawnMembersSection
        withdrawnHeld={stats.withdrawnHeld}
        withdrawnHolders={stats.withdrawnHolders}
        tStats={tStats}
      />
    </div>
  )
}
