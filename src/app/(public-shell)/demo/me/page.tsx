import Link from 'next/link'
import {
  Activity,
  Calendar,
  ChevronRight,
  Coins,
  Crown,
  ListChecks,
  Send,
  ShieldCheck,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { DEMO_MEMBERS } from '@/data/demo-seed'
import type { DemoRelativeDay, DemoTimeLabel } from '@/data/demo-seed'
import BadgeGrid from '@/components/BadgeGrid'
import MemberNextActionsPanel from '@/components/MemberNextActionsPanel'
import MyHomeDashboardCard from '@/components/MyHomeDashboardCard'
import MemberPriorityMetrics from '@/components/MemberPriorityMetrics'
import DemoActionButton from '../_components/DemoActionButton'
import DemoCTACard from '../_components/DemoCTACard'
import DemoGuidedTour from '../_components/DemoGuidedTour'
import type { MyDashboardData } from '@/app/actions/me-dashboard'
import {
  formatDayLabel,
  formatRelativeHoursLabel,
  formatTimeLabel,
  type DemoTranslator,
} from '../_lib/format'

// Eternia 를 mock 로그인 사용자로 고정. 실 /me 의 비주얼/섹션 구성을 그대로
// 옮긴 데모 — 인증 배지, MyHomeDashboardCard 스타일 메트릭 5장, BadgeGrid,
// 신청 내역 진입, 양도/환전/포인트 환전 섹션, 최근 활동, 참여 이벤트 목록.
// 모든 액션 버튼은 DemoActionButton 으로 토스트 안내만.

const ME = DEMO_MEMBERS[0]
const LIFETIME_EARNED = 28_400
const LIFETIME_SPENT = 19_120
const PARTICIPATION_COUNT = 174
const PARTICIPATION_CURRENT_STREAK = 6
const PARTICIPATION_LONGEST_STREAK = 18
const DEATHLESS_LONGEST_STREAK = 11
const WINS = 124
const LOSSES = 32
const EVALUATED_EVENTS = 162
const PENDING_REGEAR = 1
const PENDING_EXCHANGE = 1
const PENDING_DONATION = 1
const PENDING_TOTAL = PENDING_REGEAR + PENDING_EXCHANGE + PENDING_DONATION
const PENDING_EXCHANGE_AMOUNT = 1_200
const SIPHON_DEPOSITED = 120
const SIPHON_WITHDRAWN = 46
const SIPHON_NET = SIPHON_DEPOSITED - SIPHON_WITHDRAWN
const SIPHON_LAST_ACTIVITY: DemoTimeLabel = { day: 'yesterday', time: '23:18' }

const WEEK_WINS = 9
const WEEK_LOSSES = 3

const NEXT_EVENT = {
  id: 'evt-1',
  titleRaw: 'Roads 7v7 — Mercia Ore',
  scheduledAt: { day: 'today', time: '22:00' } satisfies DemoTimeLabel,
}

function buildDemoDashboard(nextEventTimeLabel: string): MyDashboardData {
  return {
    balance: ME.points,
    lifetimeEarned: LIFETIME_EARNED,
    lifetimeSpent: LIFETIME_SPENT,
    kills: ME.kills,
    deaths: ME.deaths,
    survivalRate: ME.survivalPct / 100,
    evaluatedEvents: EVALUATED_EVENTS,
    currentDeathlessStreak: 3,
    longestDeathlessStreak: DEATHLESS_LONGEST_STREAK,
    participationCount: PARTICIPATION_COUNT,
    participationCurrentStreak: PARTICIPATION_CURRENT_STREAK,
    participationLongestStreak: PARTICIPATION_LONGEST_STREAK,
    wins: WINS,
    losses: LOSSES,
    winRate: WINS / (WINS + LOSSES),
    evaluatedOutcomeEvents: 156,
    weekBattleCount: 12,
    weekKills: 18,
    weekDeaths: 4,
    weekWins: WEEK_WINS,
    weekLosses: WEEK_LOSSES,
    nextUpcomingEvent: {
      id: NEXT_EVENT.id,
      title: NEXT_EVENT.titleRaw,
      gather_at: null,
      gather_time: nextEventTimeLabel,
      role_name: 'DefTanker',
    },
    nextActionEvent: {
      id: NEXT_EVENT.id,
      title: NEXT_EVENT.titleRaw,
      gather_at: null,
      gather_time: nextEventTimeLabel,
      role_name: 'DefTanker',
      kind: 'assigned',
    },
    pendingRegearCount: PENDING_REGEAR,
    pendingExchangeCount: PENDING_EXCHANGE,
    pendingDonationCount: PENDING_DONATION,
  }
}
const ME_TOUR_STEPS = [
  { id: 'me-verified' },
  { id: 'me-summary' },
  { id: 'me-siphon' },
  { id: 'me-wallet' },
  { id: 'me-activity' },
] as const

type ParticipationItem = {
  id: string
  titleRaw: string
  scheduledAt: DemoTimeLabel
  role: string
}

const PARTICIPATIONS: ReadonlyArray<ParticipationItem> = [
  { id: 'evt-4', titleRaw: 'Roads 7v7 — Mercia', scheduledAt: { day: 'yesterday', time: '22:00' }, role: 'Tank' },
  { id: 'evt-5', titleRaw: 'Hellgate 4v4', scheduledAt: { day: 'd2ago', time: '22:14' }, role: 'Tank' },
  { id: 'evt-3', titleRaw: 'Hellgate 4v4 — Fame Farm', scheduledAt: { day: 'd3ago', time: '21:00' }, role: 'Tank' },
]

type ActivityKind = 'regear' | 'exchange' | 'donation' | 'event'

type ActivityItem = {
  id: string
  kind: ActivityKind
  time: { kind: 'hoursAgo'; count: number } | { kind: 'day'; day: DemoRelativeDay }
}

const ACTIVITIES: ReadonlyArray<ActivityItem> = [
  { id: 'a1', kind: 'regear', time: { kind: 'hoursAgo', count: 2 } },
  { id: 'a2', kind: 'event', time: { kind: 'day', day: 'yesterday' } },
  { id: 'a3', kind: 'exchange', time: { kind: 'day', day: 'd3ago' } },
  { id: 'a4', kind: 'donation', time: { kind: 'day', day: 'd5ago' } },
]

function formatActivityTime(t: DemoTranslator, time: ActivityItem['time']): string {
  return time.kind === 'hoursAgo'
    ? formatRelativeHoursLabel(t, time.count)
    : formatDayLabel(t, time.day)
}

function formatSilver(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return n.toLocaleString()
}

export default async function DemoMePage() {
  const [t, tDemo, tDemoMe, tRequests, tCta] = await Promise.all([
    getTranslations('me'),
    getTranslations('demo'),
    getTranslations('demo.me'),
    getTranslations('myRequests'),
    getTranslations('demo.ctaCard'),
  ])

  const survivalRate = ME.survivalPct / 100
  const nextEventTimeLabel = formatTimeLabel(tDemo, NEXT_EVENT.scheduledAt)
  const demoDashboard = buildDemoDashboard(nextEventTimeLabel)
  const nextEventForAction = {
    id: NEXT_EVENT.id,
    title: NEXT_EVENT.titleRaw,
    subtitle: `${nextEventTimeLabel} · ${tDemoMe('nextEventRole')}`,
    kind: 'assigned' as const,
  }

  return (
    <div className="v3-member-workspace space-y-6">
      <DemoGuidedTour steps={ME_TOUR_STEPS} namespace="me" />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">{t('title')}</h1>
          <p className="text-gray-400 text-sm">{t('description')}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-200 border border-amber-400/40 uppercase tracking-wider">
          <Sparkles size={11} />
          {tDemoMe('viewingAsEyebrow')}
        </span>
      </div>

      <MemberNextActionsPanel
        albionVerified
        pendingTotal={PENDING_TOTAL}
        nextEvent={nextEventForAction}
        labels={{
          title: t('actionTitle'),
          description: t('actionDescription'),
          verifyTitle: t('actionVerifyTitle'),
          verifyBody: t('actionVerifyBody'),
          requestsTitle: t('actionRequestsTitle'),
          requestsBody: t('actionRequestsBody', { count: PENDING_TOTAL }),
          nextEventTitle: t('actionNextEventTitle'),
          pendingEventTitle: t('actionPendingEventTitle'),
          tentativeEventTitle: t('actionTentativeEventTitle'),
          availableEventTitle: t('actionAvailableEventTitle'),
          regearTitle: t('actionRegearTitle'),
          regearBody: (item) => t('actionRegearBody', {
            role: item.roleName,
            reward: item.reward,
            deadline: item.deadline,
          }),
          noItemsTitle: t('actionNoItemsTitle'),
          noItemsBody: t('actionNoItemsBody'),
          open: t('actionOpen'),
        }}
        verifyHref="/demo/me/profile"
        requestsHref="/demo/me/requests"
        eventHrefPrefix="/demo/events"
      />

      <MemberPriorityMetrics
        tourId="me-summary"
        compact
        items={[
          {
            href: '#wallet',
            icon: <Coins size={22} />,
            label: t('priorityPointsLabel'),
            value: formatSilver(ME.points),
            sub: t('priorityPointsPendingSub', { amount: formatSilver(PENDING_EXCHANGE_AMOUNT) }),
            tone: 'points',
          },
          {
            href: '#siphon',
            icon: <Zap size={22} />,
            label: t('prioritySiphonLabel'),
            value: t('siphonUnit', { count: `+${SIPHON_NET.toLocaleString('en-US')}` }),
            sub: t('siphonPositiveSub'),
            tone: 'positive',
          },
        ]}
      />

      <section data-tour-id="me-verified" className="flex items-start gap-3 rounded-2xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-200 p-4">
        <ShieldCheck size={20} className="flex-shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold flex items-center gap-2 flex-wrap">
            <span>Albion Verified</span>
            <span className="text-xs opacity-80 font-mono">
              {ME.ign}
              <span className="ml-1 opacity-70">· {tDemoMe('profileServerLabel')}</span>
            </span>
          </p>
          <p className="text-xs leading-relaxed opacity-80">{tDemoMe('verifiedNote')}</p>
        </div>
      </section>

      <MyHomeDashboardCard
        data={demoDashboard}
        weeklyStatsEnabled
        eventHrefPrefix="/demo/events"
        visualRefreshEnabled
      />

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <QuickLinkCard
          href="/demo/member-events"
          icon={<Calendar size={16} />}
          title={t('quickEventsTitle')}
          body={t('quickEventsBody')}
        />
        <QuickLinkCard
          href="#wallet"
          icon={<Coins size={16} />}
          title={t('quickWalletTitle')}
          body={t('quickWalletBody')}
        />
        <QuickLinkCard
          href="#siphon"
          icon={<Zap size={16} />}
          title={t('quickSiphonTitle')}
          body={t('quickSiphonBody')}
        />
        <QuickLinkCard
          href="/demo/member-regear"
          icon={<ShieldCheck size={16} />}
          title={t('quickRegearTitle')}
          body={t('quickRegearBody')}
        />
        <QuickLinkCard
          href="/demo/leaderboard"
          icon={<Trophy size={16} />}
          title={t('quickLeaderboardTitle')}
          body={t('quickLeaderboardBody')}
        />
      </section>

      <section id="siphon" data-tour-id="me-siphon" className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4 scroll-mt-20">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Zap size={18} className="text-amber-300" />
              {t('siphonTitle')}
            </h2>
            <p className="text-gray-400 text-xs leading-relaxed mt-1">{t('siphonDescription')}</p>
          </div>
          <Link
            href="/demo/me/siphon"
            className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200"
          >
            <ListChecks size={14} />
            {t('siphonHistoryLink')}
          </Link>
        </div>
        <p className="text-[11px] text-gray-500">
          {t('siphonVerifiedPlayer', { player: ME.ign })}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <WalletMetric
            label={t('siphonBalanceLabel')}
            value={t('siphonUnit', { count: `+${SIPHON_NET.toLocaleString('en-US')}` })}
            valueClass="text-emerald-300"
            sub={t('siphonPositiveSub')}
          />
          <WalletMetric
            label={t('siphonDepositedLabel')}
            value={t('siphonUnit', { count: SIPHON_DEPOSITED.toLocaleString('en-US') })}
            valueClass="text-emerald-300"
          />
          <WalletMetric
            label={t('siphonWithdrawnLabel')}
            value={t('siphonUnit', { count: SIPHON_WITHDRAWN.toLocaleString('en-US') })}
            valueClass="text-rose-300"
          />
          <WalletMetric
            label={t('siphonLastActivityLabel')}
            value={formatTimeLabel(tDemo, SIPHON_LAST_ACTIVITY)}
          />
        </div>
      </section>

      <BadgeGrid
        input={{
          participationCount: PARTICIPATION_COUNT,
          kills: ME.kills,
          deathlessLongestStreak: DEATHLESS_LONGEST_STREAK,
          survivalRate,
          evaluatedEvents: EVALUATED_EVENTS,
          participationLongestStreak: PARTICIPATION_LONGEST_STREAK,
          wins: WINS,
        }}
      />

      <Link
        href="/demo/me/requests"
        className="flex items-center justify-between gap-3 bg-gray-900 border border-gray-700 hover:border-amber-500/40 rounded-2xl px-4 py-3 transition-colors group cursor-pointer"
      >
        <div className="min-w-0 flex-1 text-left">
          <p className="text-white text-sm font-semibold">{tRequests('cardTitle')}</p>
          <p className="text-gray-500 text-xs mt-0.5">
            {tRequests('cardSubtitlePending', { count: PENDING_TOTAL })}
          </p>
        </div>
        <ChevronRight size={18} className="text-gray-500 group-hover:text-amber-400 flex-shrink-0" />
      </Link>

      <section id="wallet" data-tour-id="me-wallet" className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4 scroll-mt-20">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-white">{t('walletTitle')}</h2>
            <p className="text-gray-400 text-xs leading-relaxed mt-1">{t('walletDescription')}</p>
          </div>
          <DemoActionButton className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200">
            <ListChecks size={14} />
            {t('walletHistoryLink')}
          </DemoActionButton>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <WalletMetric label={t('walletBalanceLabel')} value={formatSilver(ME.points)} accent />
          <WalletMetric
            label={t('walletExchangeLabel')}
            value={formatSilver(PENDING_EXCHANGE_AMOUNT)}
            sub={t('walletPendingExchange')}
          />
          <WalletMetric
            label={t('walletLifetimeLabel')}
            value={t('walletLifetimeValue', {
              earned: formatSilver(LIFETIME_EARNED),
              spent: formatSilver(LIFETIME_SPENT),
            })}
            sub={t('walletLifetimeSub')}
          />
        </div>
        <div className="border-t border-gray-800 pt-4 space-y-3">
          <h3 className="text-sm font-bold text-white">{t('exchangeTitle')}</h3>
          <p className="text-gray-400 text-xs leading-relaxed">{t('exchangeDescription')}</p>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3">
            <span className="text-xs text-gray-400">{t('walletExchangeReady')}</span>
            <DemoActionButton className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold px-3 py-1.5 rounded-lg text-xs transition-colors">
              <Coins size={12} />
              {t('exchangeTitle')}
            </DemoActionButton>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-4 flex items-center justify-between gap-3">
          <p className="text-gray-500 text-[11px] leading-relaxed min-w-0 flex-1">
            {t('transferDescription')}
          </p>
          <DemoActionButton className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold px-3 py-1.5 rounded-lg text-xs transition-colors flex-shrink-0">
            <Send size={12} />
            {t('transferOpen')}
          </DemoActionButton>
        </div>
      </section>

      <section data-tour-id="me-activity" className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-white">{t('donationTitle')}</h2>
          <DemoActionButton className="inline-flex items-center gap-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors border border-emerald-500/30">
            <Coins size={12} />
            {t('donationTitle')}
          </DemoActionButton>
        </div>
        <p className="text-gray-400 text-xs leading-relaxed">{t('donationDescription')}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Activity size={16} className="text-amber-400" />
          {tDemoMe('activityTitle')}
        </h2>
        <ul className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
          {ACTIVITIES.map((a) => (
            <ActivityRow
              key={a.id}
              item={a}
              whenLabel={formatActivityTime(tDemo, a.time)}
              tDemoMe={tDemoMe}
            />
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-white">{t('participationTitle')}</h2>
          <p className="text-xs text-gray-400">
            {t('participationCount', { count: PARTICIPATIONS.length })}
          </p>
        </div>
        <ul className="space-y-2">
          {PARTICIPATIONS.map((p) => (
            <li key={p.id} className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
              <Link
                href={`/demo/events/${p.id}`}
                className="flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-medium truncate">{p.titleRaw}</p>
                  <p className="text-gray-500 text-xs">
                    {formatTimeLabel(tDemo, p.scheduledAt)}
                    <span className="ml-2 text-gray-400">· {p.role}</span>
                  </p>
                </div>
                <ChevronRight size={14} className="text-gray-600 flex-shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta('members.title')}
        description={tCta('members.description')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}

function QuickLinkCard({
  href,
  icon,
  title,
  body,
}: {
  href: string
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl border border-gray-800 bg-gray-900 px-4 py-3 hover:border-amber-500/40 transition-colors"
    >
      <div className="flex items-center gap-2 text-amber-300">
        {icon}
        <p className="text-sm font-bold text-white truncate">{title}</p>
      </div>
      <p className="mt-1 text-xs text-gray-500 leading-relaxed line-clamp-2">{body}</p>
    </Link>
  )
}

function WalletMetric({
  label,
  value,
  sub,
  accent = false,
  valueClass,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
  valueClass?: string
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold font-mono ${valueClass ?? (accent ? 'text-amber-300' : 'text-white')}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-gray-500">{sub}</p>}
    </div>
  )
}

const ACTIVITY_ICONS: Record<ActivityKind, { icon: React.ComponentType<{ size?: number; className?: string }>; tone: string }> = {
  regear: { icon: ShieldCheck, tone: 'text-amber-400' },
  exchange: { icon: Coins, tone: 'text-emerald-400' },
  donation: { icon: Coins, tone: 'text-emerald-300' },
  event: { icon: Crown, tone: 'text-amber-300' },
}

const ACTIVITY_LABEL_KEY: Record<ActivityKind, { title: string; note: string }> = {
  regear: { title: 'activityRegear', note: 'activityRegearNote' },
  exchange: { title: 'activityExchange', note: 'activityExchangeNote' },
  donation: { title: 'activityDonation', note: 'activityDonationNote' },
  event: { title: 'activityEvent', note: 'activityEventNote' },
}

function ActivityRow({
  item,
  whenLabel,
  tDemoMe,
}: {
  item: ActivityItem
  whenLabel: string
  tDemoMe: Awaited<ReturnType<typeof getTranslations<'demo.me'>>>
}) {
  const { icon: Icon, tone } = ACTIVITY_ICONS[item.kind]
  const { title, note } = ACTIVITY_LABEL_KEY[item.kind]
  return (
    <li className="flex items-start gap-3 px-4 py-2.5 text-sm">
      <Icon size={16} className={`${tone} flex-shrink-0 mt-0.5`} />
      <div className="min-w-0 flex-1">
        <p className="text-white font-medium text-xs">{tDemoMe(title)}</p>
        <p className="text-gray-500 text-[11px] mt-0.5">{tDemoMe(note)}</p>
      </div>
      <span className="text-gray-600 text-[10px] font-mono flex-shrink-0">{whenLabel}</span>
    </li>
  )
}
