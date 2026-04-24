import Image from 'next/image'
import { getTranslations } from 'next-intl/server'
import {
  BarChart3,
  Wallet,
  TrendingUp,
  TrendingDown,
  Users,
  CalendarCheck,
  UserCheck,
  UserMinus,
  UserX,
  ShoppingBag,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Clock,
  Trophy,
  LineChart,
  ArrowDownRight,
  ArrowUpRight,
} from 'lucide-react'
import {
  getPointStats,
  getEventStats,
  getShopRegearStats,
  getAlbionVerificationStats,
  getFinanceFlowStats,
  type TopHolder,
  type VerificationMember,
  type FinanceFlowStats,
} from '@/app/actions/stats-admin'
import MemberAvatar from '@/components/MemberAvatar'
import MemberLink from '@/components/MemberLink'
import ForceOnboardButton from '@/components/ForceOnboardButton'
import CollapsibleList from '@/components/CollapsibleList'
import { ALBION_SERVER_LABEL } from '@/lib/albion-gameinfo'

type StatsTranslator = Awaited<ReturnType<typeof getTranslations<'adminStats'>>>

// 통계 페이지의 모든 상위 N 목록이 공유하는 기본 접힘 행수. 바꾸려면 여기만.
const STATS_COLLAPSED_ROWS = 8

export const dynamic = 'force-dynamic'

function itemImageUrl(uniqueName: string, enchant: number, quality: number): string {
  const id = enchant > 0 ? `${uniqueName}@${enchant}` : uniqueName
  const params = new URLSearchParams({ quality: String(quality), size: '48' })
  return `https://render.albiononline.com/v1/item/${id}.png?${params.toString()}`
}

export default async function AdminStatsPage() {
  // 다섯 섹션을 병렬로 — 하나가 느려도 다른 섹션이 블로킹되지 않도록.
  const [tNav, tStats, pointRes, eventRes, shopRegearRes, verificationRes, financeRes] =
    await Promise.all([
      getTranslations('nav'),
      getTranslations('adminStats'),
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
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <BarChart3 size={22} className="text-amber-400" />
        <h1 className="text-2xl font-bold text-white">{tNav('stats')}</h1>
      </div>
      <p className="text-sm text-gray-400">{tStats('ledgerDescription')}</p>

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

      <section className="bg-gray-900/60 border border-gray-700 rounded-lg">
        <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">{tStats('topHoldersTitle')}</h2>
          <span className="text-xs text-gray-500">Top {stats.topHolders.length}</span>
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
              >
                <span className="text-xs text-gray-500 font-mono w-6 text-right">{idx + 1}</span>
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

      <FinanceFlowSection result={financeRes} tStats={tStats} />
      <AlbionVerificationSection result={verificationRes} tStats={tStats} />
      <EventParticipationSection result={eventRes} tStats={tStats} />
      <ShopRegearSection result={shopRegearRes} tStats={tStats} />
      <WithdrawnMembersSection
        withdrawnHeld={stats.withdrawnHeld}
        withdrawnHolders={stats.withdrawnHolders}
        tStats={tStats}
      />
    </div>
  )
}

function WithdrawnMembersSection({
  withdrawnHeld,
  withdrawnHolders,
  tStats,
}: {
  withdrawnHeld: number
  withdrawnHolders: TopHolder[]
  tStats: StatsTranslator
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <UserMinus size={18} className="text-gray-400" />
        <h2 className="text-lg font-semibold text-white">{tStats('withdrawnTitle')}</h2>
      </div>
      <p className="text-xs text-gray-500">{tStats('withdrawnDescription')}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-gray-400" />
            <span className="text-xs text-gray-300">{tStats('withdrawnHeldLabel')}</span>
          </div>
          <div className="text-2xl font-bold font-mono text-gray-300">
            {withdrawnHeld.toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-500">{tStats('withdrawnHeldHint')}</div>
        </div>
        <div className="bg-gray-800/40 border border-gray-700 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <UserMinus size={16} className="text-gray-400" />
            <span className="text-xs text-gray-300">{tStats('withdrawnHoldersLabel')}</span>
          </div>
          <div className="text-2xl font-bold font-mono text-gray-300">
            {withdrawnHolders.length.toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-500">{tStats('withdrawnHoldersHint')}</div>
        </div>
      </div>

      <div className="bg-gray-900/60 border border-gray-700 rounded-lg">
        <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">{tStats('withdrawnListTitle')}</h3>
          <span className="text-xs text-gray-500">
            {tStats('membersCount', { count: withdrawnHolders.length.toLocaleString() })}
          </span>
        </header>
        {withdrawnHolders.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            {tStats('withdrawnListEmpty')}
          </div>
        ) : (
          <CollapsibleList
            as="ol"
            className="divide-y divide-gray-800"
            initialCount={STATS_COLLAPSED_ROWS}
            unit="members"
          >
            {withdrawnHolders.map((h, idx) => (
              <li
                key={h.discordId}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800/40"
              >
                <span className="text-xs text-gray-500 font-mono w-6 text-right">{idx + 1}</span>
                <MemberAvatar discordId={h.discordId} avatar={h.avatar} size={24} />
                <span className="flex-1 text-sm text-gray-400 truncate flex items-center gap-2 min-w-0">
                  <MemberLink
                    discordId={h.discordId}
                    username={h.username}
                    className="truncate line-through"
                  />
                  <span className="text-[10px] text-gray-500 border border-gray-700 rounded px-1 py-0.5 flex-shrink-0">
                    WITHDRAWN
                  </span>
                </span>
                <span className="text-sm font-mono text-gray-400 tabular-nums">
                  {h.balance.toLocaleString()}
                </span>
              </li>
            ))}
          </CollapsibleList>
        )}
      </div>
    </section>
  )
}

function EventParticipationSection({
  result,
  tStats,
}: {
  result: Awaited<ReturnType<typeof getEventStats>>
  tStats: StatsTranslator
}) {
  const { stats, error } = result
  if (error || !stats) {
    return (
      <section className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 text-sm text-red-300">
        {tStats('eventLoadError')}: {error ?? tStats('unknownError')}
      </section>
    )
  }

  const ratePercent = Math.round(stats.participationRate * 1000) / 10 // 소수 1자리.
  const cards = [
    {
      label: tStats('eventCardEventsLabel', { days: stats.windowDays }),
      value: stats.totalEvents,
      hint: tStats('eventCardEventsHint'),
      icon: CalendarCheck,
      accent: 'text-indigo-300',
      ring: 'border-indigo-500/30',
      bg: 'bg-indigo-500/5',
    },
    {
      label: tStats('eventCardActiveLabel'),
      value: stats.activeMembers,
      hint: tStats('eventCardActiveHint', { total: stats.totalMembers.toLocaleString() }),
      icon: UserCheck,
      accent: 'text-emerald-300',
      ring: 'border-emerald-500/30',
      bg: 'bg-emerald-500/5',
    },
    {
      label: tStats('eventCardRateLabel'),
      value: `${ratePercent.toLocaleString()}%`,
      hint: tStats('eventCardRateHint'),
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
            </div>
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
                <MemberAvatar discordId={a.discordId} avatar={a.avatar} size={24} />
                <span className="flex-1 text-sm text-gray-200 truncate flex items-center gap-2 min-w-0">
                  <MemberLink
                    discordId={a.discordId}
                    username={a.username}
                    className="truncate"
                  />
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

function ShopRegearSection({
  result,
  tStats,
}: {
  result: Awaited<ReturnType<typeof getShopRegearStats>>
  tStats: StatsTranslator
}) {
  const { stats, error } = result
  if (error || !stats) {
    return (
      <section className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 text-sm text-red-300">
        {tStats('shopRegearLoadError')}: {error ?? tStats('unknownError')}
      </section>
    )
  }

  const cards = [
    {
      label: tStats('shopOrdersLabel', { days: stats.windowDays }),
      value: stats.ordersCreated,
      hint: tStats('shopOrdersHint', {
        approved: stats.ordersApproved.toLocaleString(),
        points: stats.pointsSpent.toLocaleString(),
      }),
      icon: ShoppingBag,
      accent: 'text-amber-300',
      ring: 'border-amber-500/30',
      bg: 'bg-amber-500/5',
    },
    {
      label: tStats('regearCreatedLabel', { days: stats.windowDays }),
      value: stats.regearCreated,
      hint: tStats('regearCreatedHint', {
        approved: stats.regearApproved.toLocaleString(),
        silver: stats.silverPaid.toLocaleString(),
      }),
      icon: ShieldCheck,
      accent: 'text-emerald-300',
      ring: 'border-emerald-500/30',
      bg: 'bg-emerald-500/5',
    },
    {
      label: tStats('shopPendingLabel'),
      value: stats.ordersPending,
      hint: tStats('shopPendingHint'),
      icon: Clock,
      accent: stats.ordersPending > 0 ? 'text-rose-300' : 'text-gray-400',
      ring: stats.ordersPending > 0 ? 'border-rose-500/30' : 'border-gray-700',
      bg: stats.ordersPending > 0 ? 'bg-rose-500/5' : 'bg-gray-800/40',
    },
    {
      label: tStats('regearPendingLabel'),
      value: stats.regearPending,
      hint: tStats('regearPendingHint'),
      icon: Clock,
      accent: stats.regearPending > 0 ? 'text-rose-300' : 'text-gray-400',
      ring: stats.regearPending > 0 ? 'border-rose-500/30' : 'border-gray-700',
      bg: stats.regearPending > 0 ? 'bg-rose-500/5' : 'bg-gray-800/40',
    },
  ]

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Trophy size={18} className="text-amber-300" />
        <h2 className="text-lg font-semibold text-white">
          {tStats('shopRegearTitle', { days: stats.windowDays })}
        </h2>
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

      <div className="bg-gray-900/60 border border-gray-700 rounded-lg">
        <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">{tStats('topSoldTitle')}</h3>
          <span className="text-xs text-gray-500">
            {tStats('topSoldSubtitle', { count: stats.topSoldItems.length })}
          </span>
        </header>
        {stats.topSoldItems.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            {tStats('topSoldEmpty')}
          </div>
        ) : (
          <CollapsibleList
            as="ol"
            className="divide-y divide-gray-800"
            initialCount={STATS_COLLAPSED_ROWS}
            unit="items"
          >
            {stats.topSoldItems.map((item, idx) => (
              <li
                key={`${item.uniqueName}@${item.enchant}#${item.quality}`}
                className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800/40"
              >
                <span className="text-xs text-gray-500 font-mono w-6 text-right">{idx + 1}</span>
                <div className="relative w-8 h-8 rounded bg-gray-950 flex-shrink-0">
                  <Image
                    src={itemImageUrl(item.uniqueName, item.enchant, item.quality)}
                    alt={item.nameKo}
                    fill
                    className="object-contain pixel-img"
                    unoptimized
                  />
                </div>
                <span className="flex-1 text-sm text-gray-200 truncate">
                  {item.nameKo}
                  {item.enchant > 0 && (
                    <span className="text-amber-300 ml-1 font-mono">.{item.enchant}</span>
                  )}
                </span>
                <span className="text-xs font-mono text-gray-400 tabular-nums">
                  × {item.quantity.toLocaleString()}
                </span>
                <span className="text-sm font-mono text-amber-300 tabular-nums w-24 text-right">
                  {item.points.toLocaleString()}p
                </span>
              </li>
            ))}
          </CollapsibleList>
        )}
      </div>
    </section>
  )
}

function AlbionVerificationSection({
  result,
  tStats,
}: {
  result: Awaited<ReturnType<typeof getAlbionVerificationStats>>
  tStats: StatsTranslator
}) {
  const { stats, error } = result
  if (error || !stats) {
    return (
      <section className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 text-sm text-red-300">
        {tStats('verificationLoadError')}: {error ?? tStats('unknownError')}
      </section>
    )
  }

  const cards = [
    {
      label: tStats('verificationActiveLabel'),
      value: stats.totalActive,
      hint: tStats('verificationActiveHint'),
      icon: Users,
      accent: 'text-gray-300',
      ring: 'border-gray-700',
      bg: 'bg-gray-800/40',
    },
    {
      label: tStats('verificationVerifiedLabel'),
      value: stats.verified,
      hint: tStats('verificationVerifiedHint'),
      icon: ShieldCheck,
      accent: 'text-emerald-300',
      ring: 'border-emerald-500/30',
      bg: 'bg-emerald-500/5',
    },
    {
      label: tStats('verificationUnverifiedLabel'),
      value: stats.unverified,
      hint: tStats('verificationUnverifiedHint'),
      icon: ShieldAlert,
      accent: stats.unverified > 0 ? 'text-yellow-300' : 'text-gray-400',
      ring: stats.unverified > 0 ? 'border-yellow-500/30' : 'border-gray-700',
      bg: stats.unverified > 0 ? 'bg-yellow-500/5' : 'bg-gray-800/40',
    },
    {
      label: tStats('verificationOnboardingPendingLabel'),
      value: stats.onboardingPending,
      hint: tStats('verificationOnboardingPendingHint'),
      icon: ShieldQuestion,
      accent: stats.onboardingPending > 0 ? 'text-rose-300' : 'text-gray-400',
      ring: stats.onboardingPending > 0 ? 'border-rose-500/30' : 'border-gray-700',
      bg: stats.onboardingPending > 0 ? 'bg-rose-500/5' : 'bg-gray-800/40',
    },
  ]

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={18} className="text-emerald-300" />
        <h2 className="text-lg font-semibold text-white">{tStats('verificationTitle')}</h2>
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">
        {tStats('verificationDescription')}
        {!stats.homeGuildConfigured && (
          <span className="text-amber-300 ml-1">
            {tStats('verificationNoHomeGuildWarning')}
          </span>
        )}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

      <VerificationMemberList
        title={tStats('pendingMembersTitle')}
        icon={UserX}
        accent="text-rose-300"
        emptyLabel={tStats('pendingMembersEmpty')}
        members={stats.pendingMembers}
        mode="pending"
        tStats={tStats}
      />
      <VerificationMemberList
        title={tStats('unverifiedMembersTitle')}
        icon={ShieldAlert}
        accent="text-yellow-300"
        emptyLabel={tStats('unverifiedMembersEmpty')}
        members={stats.unverifiedMembers}
        mode="unverified"
        tStats={tStats}
      />
    </section>
  )
}

function VerificationMemberList({
  title,
  icon: Icon,
  accent,
  emptyLabel,
  members,
  mode,
  tStats,
}: {
  title: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  accent: string
  emptyLabel: string
  members: VerificationMember[]
  mode: 'pending' | 'unverified'
  tStats: StatsTranslator
}) {
  return (
    <div className="bg-gray-900/60 border border-gray-700 rounded-lg">
      <header className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Icon size={14} className={accent} />
          {title}
        </h3>
        <span className="text-xs text-gray-500">
          {tStats('membersCount', { count: members.length.toLocaleString() })}
        </span>
      </header>
      {members.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-500">{emptyLabel}</div>
      ) : (
        <CollapsibleList
          as="ul"
          className="divide-y divide-gray-800"
          initialCount={STATS_COLLAPSED_ROWS}
          unit="members"
        >
          {members.map((m) => (
            <li key={m.discordId} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-800/40">
              <MemberAvatar discordId={m.discordId} avatar={m.avatar} size={24} />
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <MemberLink
                  discordId={m.discordId}
                  username={m.username}
                  className="text-sm text-gray-200 truncate"
                />
                {m.isAdmin && (
                  <span className="text-[10px] text-amber-400 border border-amber-500/40 rounded px-1 py-0.5 flex-shrink-0">
                    ADMIN
                  </span>
                )}
              </div>
              {mode === 'unverified' && (
                <div className="hidden sm:flex flex-col items-end text-[11px] text-gray-500 min-w-0">
                  <span className="text-gray-300 truncate max-w-[140px]">
                    {m.nickname ?? '—'}
                  </span>
                  <span className="font-mono">
                    {m.server ? ALBION_SERVER_LABEL[m.server] : '—'}
                    {m.guildId ? (
                      m.guildMatchesHome ? (
                        <span className="ml-1 text-emerald-400">
                          · {tStats('verificationGuildMatch')}
                        </span>
                      ) : (
                        <span className="ml-1 text-rose-400">
                          · {tStats('verificationGuildMismatch')}
                        </span>
                      )
                    ) : (
                      <span className="ml-1 text-gray-600">
                        · {tStats('verificationManualInput')}
                      </span>
                    )}
                  </span>
                </div>
              )}
              <ForceOnboardButton discordId={m.discordId} username={m.username} />
            </li>
          ))}
        </CollapsibleList>
      )}
    </div>
  )
}

// 포인트 원장의 reason 코드 → i18n 키. 원장 CHECK 제약이 migration 별로
// 달라 과거 데이터에 남아있는 레거시 reason 도 폴백 없이 그대로 표시해도
// 운영자가 해석 가능해야 하므로, 알려진 코드만 친화적으로 번역.
const REASON_KEY: Record<string, string> = {
  regear_approved: 'reasonRegearApproved',
  donation_approved: 'reasonDonationApproved',
  transfer_in: 'reasonTransferIn',
  admin_adjust: 'reasonAdminAdjust',
  exchange_paid: 'reasonExchangePaid',
  shop_purchase: 'reasonShopPurchase',
  transfer_out: 'reasonTransferOut',
}

function reasonLabel(reason: string, tStats: StatsTranslator): string {
  const key = REASON_KEY[reason]
  return key ? tStats(key as Parameters<StatsTranslator>[0]) : reason
}

function FinanceFlowSection({
  result,
  tStats,
}: {
  result: { stats?: FinanceFlowStats; error?: string }
  tStats: StatsTranslator
}) {
  const { stats, error } = result
  if (error || !stats) {
    return (
      <section className="bg-gray-900/60 border border-gray-700 rounded-lg p-4 text-sm text-red-300">
        {tStats('financeLoadError')}: {error ?? tStats('unknownError')}
      </section>
    )
  }

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
      hint:
        stats.netFlow >= 0 ? tStats('financeNetPositive') : tStats('financeNetNegative'),
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
                {card.value >= 0 ? card.value.toLocaleString() : card.value.toLocaleString()}
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
  daily: FinanceFlowStats['daily']
  tStats: StatsTranslator
}) {
  // 일별 최대 earned / spent 를 공통 스케일로 사용. 한쪽만 크게 튀면 다른 쪽이
  // 납작해지지만 scale 을 공유해야 "발행 > 소멸" 같은 비교가 눈에 들어온다.
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
        <div className="flex items-end gap-[2px] h-28">
          {daily.map((d) => {
            const earnedH = peak === 0 ? 0 : (d.earned / peak) * 100
            const spentH = peak === 0 ? 0 : (d.spent / peak) * 100
            return (
              <div
                key={d.date}
                className="flex-1 flex flex-col justify-end min-w-[4px]"
                title={`${d.date} · +${d.earned.toLocaleString()} / -${d.spent.toLocaleString()}`}
              >
                <div
                  className="bg-emerald-500/70"
                  style={{ height: `${earnedH / 2}%` }}
                />
                <div
                  className="bg-rose-500/70 mt-[1px]"
                  style={{ height: `${spentH / 2}%` }}
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
  items: FinanceFlowStats['sources']
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
