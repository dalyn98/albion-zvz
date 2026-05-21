import Link from 'next/link'
import {
  Activity,
  Bell,
  Calendar,
  ChevronRight,
  Coins,
  Crown,
  HandHeart,
  Heart,
  ListChecks,
  Send,
  ShieldCheck,
  Sparkles,
  Skull,
  Swords,
  Trophy,
  Zap,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { DEMO_MEMBERS } from '@/data/demo-seed'
import BadgeGrid from '@/components/BadgeGrid'
import DemoActionButton from '../_components/DemoActionButton'
import DemoCTACard from '../_components/DemoCTACard'
import DemoGuidedTour from '../_components/DemoGuidedTour'

// Eternia 를 mock 로그인 사용자로 고정. 실 /me 의 비주얼/섹션 구성을 그대로
// 옮긴 데모 — 인증 배지, MyHomeDashboardCard 스타일 메트릭 5장, BadgeGrid,
// 신청 내역 진입, 양도/환전/기부 섹션, 최근 활동, 참여 이벤트 목록.
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
const SIPHON_LAST_ACTIVITY = 'Yesterday 23:18'

const WEEK_BATTLES = 12
const WEEK_KILLS = 18
const WEEK_DEATHS = 4
const WEEK_WINS = 9
const WEEK_LOSSES = 3
const WEEK_WIN_PCT = Math.round((WEEK_WINS / (WEEK_WINS + WEEK_LOSSES)) * 100)

const NEXT_EVENT = {
  id: 'evt-1',
  titleRaw: 'Roads 7v7 — Mercia Ore',
  timeLabel: 'Today 22:00',
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
  timeLabel: string
  role: string
}

const PARTICIPATIONS: ReadonlyArray<ParticipationItem> = [
  { id: 'evt-4', titleRaw: 'Roads 7v7 — Mercia', timeLabel: 'Yesterday 22:00', role: 'Tank' },
  { id: 'evt-5', titleRaw: 'Hellgate 4v4', timeLabel: '2d ago 22:14', role: 'Tank' },
  { id: 'evt-3', titleRaw: 'Hellgate 4v4 — Fame Farm', timeLabel: '3d ago 21:00', role: 'Tank' },
]

type ActivityKind = 'regear' | 'exchange' | 'donation' | 'event'

type ActivityItem = {
  id: string
  kind: ActivityKind
  whenLabel: string
}

const ACTIVITIES: ReadonlyArray<ActivityItem> = [
  { id: 'a1', kind: 'regear', whenLabel: '2h ago' },
  { id: 'a2', kind: 'event', whenLabel: 'Yesterday' },
  { id: 'a3', kind: 'exchange', whenLabel: '3d ago' },
  { id: 'a4', kind: 'donation', whenLabel: '5d ago' },
]

function formatSilver(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return n.toLocaleString()
}

function formatKd(kills: number, deaths: number): string {
  if (deaths === 0) return kills === 0 ? '-' : `${kills}.00`
  return (kills / deaths).toFixed(2)
}

function survivalTone(rate: number): string {
  if (rate >= 0.8) return 'text-emerald-300'
  if (rate >= 0.5) return 'text-amber-300'
  return 'text-rose-300'
}

function winRateTone(rate: number): string {
  if (rate >= 0.6) return 'text-emerald-300'
  if (rate >= 0.4) return 'text-amber-300'
  return 'text-rose-300'
}

export default async function DemoMePage() {
  const [t, tMe, tDemoMe, tRequests, tCta, tWeekly] = await Promise.all([
    getTranslations('me'),
    getTranslations('me'),
    getTranslations('demo.me'),
    getTranslations('myRequests'),
    getTranslations('demo.ctaCard'),
    getTranslations('me.weekly'),
  ])

  void tMe

  const kd = formatKd(ME.kills, ME.deaths)
  const survivalRate = ME.survivalPct / 100
  const winRate = WINS / (WINS + LOSSES)
  const survivalText = `${Math.round(survivalRate * 100)}%`
  const winRateText = `${Math.round(winRate * 100)}%`

  return (
    <div className="space-y-6">
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

      <section data-tour-id="me-summary" className="bg-gray-900 border border-gray-700 rounded-2xl p-5 sm:p-6 space-y-5">
        <div>
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">
            {t('homeNextEvent')}
          </p>
          <Link
            href={`/demo/events/${NEXT_EVENT.id}`}
            className="flex items-center gap-3 bg-gray-800/60 border border-gray-700 hover:border-amber-500/40 rounded-lg px-3 py-2 transition-colors"
          >
            <Calendar size={18} className="text-amber-400 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-semibold truncate">{NEXT_EVENT.titleRaw}</p>
              <p className="text-gray-400 text-xs">
                {NEXT_EVENT.timeLabel}
                <span className="ml-2 text-gray-500">· {tDemoMe('nextEventRole')}</span>
              </p>
            </div>
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <HomeMetric
            icon={<Coins size={14} />}
            label={t('homeMetricPoints')}
            value={formatSilver(ME.points)}
          />
          <HomeMetric
            icon={<Calendar size={14} />}
            label={t('homeMetricParticipation')}
            value={String(PARTICIPATION_COUNT)}
            sub={t('homeMetricStreakSub', { days: PARTICIPATION_CURRENT_STREAK })}
          />
          <HomeMetric
            icon={<Swords size={14} />}
            label={t('homeMetricKd')}
            value={kd}
            sub={t('homeMetricKdSub', { kills: ME.kills, deaths: ME.deaths })}
          />
          <HomeMetric
            icon={<Heart size={14} />}
            label={t('homeMetricSurvival')}
            value={survivalText}
            valueClass={survivalTone(survivalRate)}
            sub={t('homeMetricEvaluatedSub', { count: EVALUATED_EVENTS })}
          />
          <HomeMetric
            icon={<Trophy size={14} />}
            label={t('homeMetricWinRate')}
            value={winRateText}
            valueClass={winRateTone(winRate)}
            sub={t('homeMetricWinLossSub', { wins: WINS, losses: LOSSES })}
          />
        </div>

        <div className="text-gray-500 text-[11px]">
          {t('summary', {
            earned: formatSilver(LIFETIME_EARNED),
            spent: formatSilver(LIFETIME_SPENT),
          })}
        </div>

        <div className="border-t border-gray-800 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={14} className="text-amber-400" />
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              {tWeekly('title')}
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <WeeklyStat
              icon={<Swords size={14} className="text-amber-400" />}
              label={tWeekly('battles')}
              value={WEEK_BATTLES.toLocaleString()}
            />
            <WeeklyStat
              icon={<Trophy size={14} className="text-emerald-400" />}
              label={tWeekly('winRate')}
              value={`${WEEK_WIN_PCT}%`}
              sub={tWeekly('winLossSub', { wins: WEEK_WINS, losses: WEEK_LOSSES })}
            />
            <WeeklyStat
              icon={<Swords size={14} className="text-emerald-400" />}
              label={tWeekly('kills')}
              value={WEEK_KILLS.toLocaleString()}
            />
            <WeeklyStat
              icon={<Skull size={14} className="text-rose-400" />}
              label={tWeekly('deaths')}
              value={WEEK_DEATHS.toLocaleString()}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-lg px-3 py-2 text-xs">
          <Bell size={14} className="flex-shrink-0" />
          <span>
            {t('homePendingPrefix')}{' '}
            <span className="font-semibold">
              {t('homePendingRegear', { count: PENDING_REGEAR })}
            </span>
            <span className="mx-1 opacity-60">·</span>
            <span className="font-semibold">
              {t('homePendingExchange', { count: PENDING_EXCHANGE })}
            </span>
            <span className="mx-1 opacity-60">·</span>
            <span className="font-semibold">
              {t('homePendingDonation', { count: PENDING_DONATION })}
            </span>
          </span>
        </div>
      </section>

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
          <DemoActionButton className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200">
            <ListChecks size={14} />
            {t('siphonHistoryLink')}
          </DemoActionButton>
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
          <WalletMetric label={t('siphonLastActivityLabel')} value={SIPHON_LAST_ACTIVITY} />
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

      <DemoActionButton
        asDiv
        className="flex items-center justify-between gap-3 bg-gray-900 border border-gray-700 hover:border-amber-500/40 rounded-2xl px-4 py-3 transition-colors group cursor-pointer"
      >
        <div className="min-w-0 flex-1 text-left">
          <p className="text-white text-sm font-semibold">{tRequests('cardTitle')}</p>
          <p className="text-gray-500 text-xs mt-0.5">
            {tRequests('cardSubtitlePending', { count: PENDING_TOTAL })}
          </p>
        </div>
        <ChevronRight size={18} className="text-gray-500 group-hover:text-amber-400 flex-shrink-0" />
      </DemoActionButton>

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
            <HandHeart size={12} />
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
            <ActivityRow key={a.id} item={a} tDemoMe={tDemoMe} />
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
                    {p.timeLabel}
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

function HomeMetric({
  icon,
  label,
  value,
  sub,
  valueClass,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  valueClass?: string
}) {
  return (
    <div className="bg-gray-800/50 border border-gray-800 rounded-lg px-3 py-2">
      <div className="flex items-center gap-1.5 text-gray-400 text-[10px] font-semibold uppercase tracking-wider">
        <span className="text-amber-400/80">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <p className={`mt-1 text-base sm:text-lg font-semibold font-mono ${valueClass ?? 'text-white'}`}>
        {value}
      </p>
      {sub && <p className="text-gray-500 text-[10px] mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

function WeeklyStat({
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
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-400 uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <p className="text-white text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-gray-500 text-[11px] font-mono">{sub}</p>}
    </div>
  )
}

const ACTIVITY_ICONS: Record<ActivityKind, { icon: React.ComponentType<{ size?: number; className?: string }>; tone: string }> = {
  regear: { icon: ShieldCheck, tone: 'text-amber-400' },
  exchange: { icon: Coins, tone: 'text-emerald-400' },
  donation: { icon: HandHeart, tone: 'text-rose-300' },
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
  tDemoMe,
}: {
  item: ActivityItem
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
      <span className="text-gray-600 text-[10px] font-mono flex-shrink-0">{item.whenLabel}</span>
    </li>
  )
}
