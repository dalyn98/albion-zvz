import { Suspense } from 'react'
import { getTranslations } from 'next-intl/server'
import { getLocale } from '@/lib/locale'
import {
  BarChart3,
  Wallet,
  TrendingUp,
  TrendingDown,
  Users,
} from 'lucide-react'
import { getPointStats } from '@/app/actions/stats-admin'
import MemberAvatar from '@/components/MemberAvatar'
import MemberLink from '@/components/MemberLink'
import CollapsibleList from '@/components/CollapsibleList'
import { STATS_COLLAPSED_ROWS } from './_components/shared'
import WithdrawnMembersSection from './_components/WithdrawnMembersSection'
import EventParticipationSection from './_components/EventParticipationSection'
import ShopRegearSection from './_components/ShopRegearSection'
import RegearVideoProofSection from './_components/RegearVideoProofSection'
import AlbionVerificationSection from './_components/AlbionVerificationSection'
import FinanceFlowSection from './_components/FinanceFlowSection'
import SectionSkeleton from './_components/SectionSkeleton'
import type { RegearOriginFilter } from '@/lib/regear-origin-filter'

export const dynamic = 'force-dynamic'

function resolveRegearOrigin(value: string | undefined): RegearOriginFilter {
  return value === 'event' || value === 'free_window' || value === 'auto'
    ? value
    : 'all'
}

export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ regearOrigin?: string }>
}) {
  // 헤더·카드·잔액 노출·탈퇴자 예외만 빠르게 막고, 나머지 섹션은
  // Suspense 로 스트리밍 — 한 섹션이 느려도 첫 paint 가 지연되지 않게.
  const [sp, tNav, tStats, tCommon, locale, pointRes] = await Promise.all([
    searchParams,
    getTranslations('nav'),
    getTranslations('adminStats'),
    getTranslations('common'),
    getLocale(),
    getPointStats(),
  ])
  const regearOrigin = resolveRegearOrigin(sp.regearOrigin)

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
      value: stats.balanceExposures.length,
      hint: tStats('cardHoldersHint', { total: stats.memberCount.toLocaleString() }),
      icon: Users,
      accent: 'text-sky-400',
      ring: 'border-sky-500/30',
      bg: 'bg-sky-500/5',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BarChart3 size={22} className="text-amber-400" />
        <h1 className="text-2xl font-bold text-white">{tNav('stats')}</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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

      <details className="group rounded-lg border border-gray-800 bg-gray-900/45">
        <summary className="flex min-h-11 cursor-pointer list-none items-center px-4 py-2 text-xs font-semibold text-gray-400 transition-colors hover:text-gray-200 marker:content-none">
          {tStats('analysisScopeTitle')}
        </summary>
        <div className="grid gap-2 border-t border-gray-800 p-3 text-xs sm:grid-cols-3">
          <div className="rounded-lg bg-gray-950/40 p-3">
            <div className="font-semibold text-gray-200">{tStats('analysisScopeLifetimeTitle')}</div>
            <p className="mt-1 text-pretty text-gray-500">{tStats('analysisScopeLifetimeBody')}</p>
          </div>
          <div className="rounded-lg bg-gray-950/40 p-3">
            <div className="font-semibold text-gray-200">{tStats('analysisScopeRollingTitle', { days: 30 })}</div>
            <p className="mt-1 text-pretty text-gray-500">{tStats('analysisScopeRollingBody')}</p>
          </div>
          <div className="rounded-lg bg-gray-950/40 p-3">
            <div className="font-semibold text-gray-200">{tStats('analysisScopeQueueTitle')}</div>
            <p className="mt-1 text-pretty text-gray-500">{tStats('analysisScopeQueueBody')}</p>
          </div>
        </div>
      </details>

      <section className="bg-gray-900/60 border border-gray-700 rounded-lg">
        <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">
              {tStats('balanceExposureTitle')}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {tStats('balanceExposureHint')}
            </p>
          </div>
          <span className="text-xs text-gray-500">
            {tStats('memberRows', { count: stats.balanceExposures.length })}
          </span>
        </header>
        {stats.balanceExposures.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            {tStats('balanceExposureEmpty')}
          </div>
        ) : (
          <CollapsibleList
            as="ul"
            className="divide-y divide-gray-800"
            initialCount={STATS_COLLAPSED_ROWS}
            unit="members"
          >
            {stats.balanceExposures.map((h) => (
              <li
                key={h.discordId}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800/40"
              >
                <MemberAvatar discordId={h.discordId} avatar={h.avatar} size={24} />
                <span className="flex-1 text-sm text-gray-200 truncate flex items-center gap-2 min-w-0">
                  <MemberLink
                    discordId={h.discordId}
                    username={h.username}
                    className="truncate"
                  />
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

      <Suspense fallback={<SectionSkeleton />}>
        <FinanceFlowSection tStats={tStats} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton />}>
        <AlbionVerificationSection tStats={tStats} tCommon={tCommon} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton />}>
        <EventParticipationSection tStats={tStats} />
      </Suspense>
      <Suspense fallback={<SectionSkeleton />}>
        <ShopRegearSection
          tStats={tStats}
          locale={locale}
          regearOrigin={regearOrigin}
        />
      </Suspense>
      <Suspense fallback={<SectionSkeleton />}>
        <RegearVideoProofSection tStats={tStats} />
      </Suspense>
      <WithdrawnMembersSection
        withdrawnHeld={stats.withdrawnHeld}
        withdrawnHolders={stats.withdrawnHolders}
        tStats={tStats}
      />
    </div>
  )
}
