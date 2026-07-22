import Link from 'next/link'
import {
  CalendarCheck,
  Coins,
  Crown,
  Flame,
  Heart,
  ShieldCheck,
  Skull,
  Sword,
  Swords,
  Sparkles,
  Target,
  Trophy,
  Wallet,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { DEMO_MEMBERS } from '@/data/demo-seed'
import type { DemoRelativeDay } from '@/data/demo-seed'
import BadgeGrid from '@/components/BadgeGrid'
import DemoCTACard from '../../_components/DemoCTACard'
import DemoGuidedTour from '../../_components/DemoGuidedTour'
import {
  formatDayLabel,
  formatRelativeHoursLabel,
  type DemoTranslator,
} from '../../_lib/format'

// Eternia 의 멤버 디테일을 데모용으로 재현. 실 /me/profile 의 MemberDetailView
// 와 유사한 구조 — 헤더(아바타+IGN+verified), 4개 통계 그룹, 뱃지 그리드,
// 무기 사용 통계, 최근 전투 이력. 모든 데이터는 시드 + 정적 상수.

const ME = DEMO_MEMBERS[0]
const KILL_FAME = 8_240_000
const DEATH_FAME = 1_640_000
const PARTICIPATION_COUNT = 174
const PARTICIPATION_CURRENT_STREAK = 6
const PARTICIPATION_LONGEST_STREAK = 18
const DEATHLESS_CURRENT_STREAK = 4
const DEATHLESS_LONGEST_STREAK = 11
const WINS = 124
const LOSSES = 32
const EVALUATED_EVENTS = 162
const KILL_RANK = 3
const KILL_RANK_TOTAL = DEMO_MEMBERS.length
const PARTICIPATION_RANK = 1
const PARTICIPATION_RANK_TOTAL = DEMO_MEMBERS.length
const LIFETIME_EARNED = 28_400
const LIFETIME_SPENT = 19_120
const REGEAR_COUNT = 18

type WeaponUsage = {
  raw: string
  count: number
}

const WEAPON_USAGE: ReadonlyArray<WeaponUsage> = [
  { raw: 'Heavy Mace (T8)', count: 96 },
  { raw: 'Camlann Mace (T8)', count: 42 },
  { raw: 'Morning Star (T8)', count: 21 },
  { raw: 'Bedrock Mace (T7)', count: 15 },
]

type RecentBattle = {
  id: string
  outcome: 'kill' | 'death'
  opponent: string
  opponentGuild: string
  weaponRaw: string
  zone: string
  fame: number
  time: { kind: 'hoursAgo'; count: number } | { kind: 'day'; day: DemoRelativeDay }
}

const RECENT_BATTLES: ReadonlyArray<RecentBattle> = [
  {
    id: 'b1',
    outcome: 'kill',
    opponent: 'Wraithling',
    opponentGuild: 'Wraith',
    weaponRaw: 'Halberd (T8)',
    zone: 'Mercia Ore',
    fame: 224_000,
    time: { kind: 'hoursAgo', count: 2 },
  },
  {
    id: 'b2',
    outcome: 'kill',
    opponent: 'IceFangs',
    opponentGuild: 'Frostbite',
    weaponRaw: 'Galatine Pair (T8)',
    zone: 'Mercia Ore',
    fame: 188_000,
    time: { kind: 'day', day: 'yesterday' },
  },
  {
    id: 'b3',
    outcome: 'death',
    opponent: 'CrimsonEdge',
    opponentGuild: 'Steel Talon',
    weaponRaw: 'Carving Sword (T8)',
    zone: 'Caerleon',
    fame: 96_000,
    time: { kind: 'day', day: 'd2ago' },
  },
  {
    id: 'b4',
    outcome: 'kill',
    opponent: 'NebulaWisp',
    opponentGuild: 'Wraith',
    weaponRaw: 'Permafrost Prism (T7)',
    zone: 'Mercia Roads',
    fame: 142_000,
    time: { kind: 'day', day: 'd3ago' },
  },
]

function formatBattleTime(t: DemoTranslator, time: RecentBattle['time']): string {
  return time.kind === 'hoursAgo'
    ? formatRelativeHoursLabel(t, time.count)
    : formatDayLabel(t, time.day)
}
const ME_PROFILE_TOUR_STEPS = [
  { id: 'me-profile-header' },
  { id: 'me-profile-stats' },
  { id: 'me-profile-weapons' },
  { id: 'me-profile-battles' },
] as const

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

export default async function DemoMyProfilePage() {
  const [t, tDetail, tDemo, tDemoMe, tCta] = await Promise.all([
    getTranslations('myProfile'),
    getTranslations('memberDetail'),
    getTranslations('demo'),
    getTranslations('demo.me'),
    getTranslations('demo.ctaCard'),
  ])

  void t

  const survivalRate = ME.survivalPct / 100
  const winRate = WINS / (WINS + LOSSES)
  const survivalText = `${Math.round(survivalRate * 100)}%`
  const winRateText = `${Math.round(winRate * 100)}%`
  const kd = formatKd(ME.kills, ME.deaths)
  const weaponTotal = WEAPON_USAGE.reduce((s, w) => s + w.count, 0)

  return (
    <div className="space-y-6">
      <DemoGuidedTour steps={ME_PROFILE_TOUR_STEPS} namespace="meProfile" />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
          {tDemoMe('profileEyebrow')}
        </p>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-200 border border-amber-400/40 uppercase tracking-wider">
          <Sparkles size={11} />
          {tDemoMe('viewingAsEyebrow')}
        </span>
      </div>

      <header data-tour-id="me-profile-header" className="flex items-center gap-4 bg-gray-900 border border-gray-800 rounded-xl p-4 sm:p-5">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-500/30 to-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xl font-bold text-amber-200 flex-shrink-0">
          {ME.ign.charAt(0)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-white text-lg sm:text-xl font-bold truncate">{ME.ign}</h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 uppercase tracking-wider">
              <ShieldCheck size={10} />
              {tDemoMe('profileVerifiedTag')}
            </span>
            <span className="text-[10px] text-gray-400 font-mono">
              · {tDemoMe('profileServerLabel')}
            </span>
          </div>
          <p className="text-gray-500 text-xs mt-0.5">
            {tDetail('recentLogin', { date: formatDayLabel(tDemo, 'today') })}
          </p>
        </div>
      </header>

      <section data-tour-id="me-profile-stats" className="space-y-3">
        <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
          <Trophy size={14} className="text-amber-400" />
          {tDetail('statsSectionTitle')}
        </h2>

        <StatSubGroup label={tDetail('statsGroupBasic')} cols={4}>
          <StatCard
            icon={<ShieldCheck size={14} className="text-amber-400" />}
            label={tDetail('statTotalParticipation')}
            value={tDetail('participationTimes', { count: PARTICIPATION_COUNT })}
          />
          <StatCard
            icon={<Coins size={14} className="text-amber-400" />}
            label={tDetail('statBalance')}
            value={ME.points.toLocaleString()}
            mono
          />
          <StatCard
            icon={<Coins size={14} className="text-emerald-400" />}
            label={tDetail('statEarned')}
            value={LIFETIME_EARNED.toLocaleString()}
            mono
          />
          <StatCard
            icon={<Wallet size={14} className="text-rose-400" />}
            label={tDetail('statSpent')}
            value={LIFETIME_SPENT.toLocaleString()}
            mono
          />
        </StatSubGroup>

        <StatSubGroup label={tDetail('statsGroupKillboard')} cols={4}>
          <StatCard
            icon={<Sword size={14} className="text-rose-400" />}
            label={tDetail('statKills')}
            value={ME.kills.toLocaleString()}
            mono
          />
          <StatCard
            icon={<Skull size={14} className="text-gray-400" />}
            label={tDetail('statDeaths')}
            value={ME.deaths.toLocaleString()}
            mono
          />
          <StatCard
            icon={<Flame size={14} className="text-orange-400" />}
            label={tDetail('statKillFame')}
            value={KILL_FAME.toLocaleString()}
            mono
          />
          <StatCard
            icon={<Flame size={14} className="text-gray-500" />}
            label={tDetail('statDeathFame')}
            value={DEATH_FAME.toLocaleString()}
            mono
          />
        </StatSubGroup>

        <StatSubGroup label={tDetail('statsGroupCombat')} cols={5}>
          <StatCard
            icon={<Target size={14} className="text-amber-400" />}
            label={tDetail('statKd')}
            value={kd}
            mono
          />
          <StatCard
            icon={<Trophy size={14} className="text-amber-400" />}
            label={tDetail('statWinRate')}
            value={winRateText}
            sub={tDetail('statWinLossSub', { wins: WINS, losses: LOSSES })}
            tone={winRateTone(winRate)}
            mono
          />
          <StatCard
            icon={<Heart size={14} className="text-emerald-400" />}
            label={tDetail('statSurvival')}
            value={survivalText}
            sub={tDetail('statSurvivalSub', { count: EVALUATED_EVENTS })}
            tone={survivalTone(survivalRate)}
            mono
          />
          <StatCard
            icon={<Crown size={14} className="text-cyan-400" />}
            label={tDetail('statDeathless')}
            value={tDetail('statStreakUnit', { count: DEATHLESS_CURRENT_STREAK })}
            sub={tDetail('statStreakLongest', { count: DEATHLESS_LONGEST_STREAK })}
            mono
          />
          <StatCard
            icon={<CalendarCheck size={14} className="text-amber-400" />}
            label={tDetail('statParticipationStreak')}
            value={tDetail('statStreakDays', { count: PARTICIPATION_CURRENT_STREAK })}
            sub={tDetail('statStreakLongestDays', { count: PARTICIPATION_LONGEST_STREAK })}
            mono
          />
        </StatSubGroup>

        <StatSubGroup label={tDetail('statsGroupActivity')} cols={3}>
          <StatCard
            icon={<ShieldCheck size={14} className="text-amber-400" />}
            label={'Regear'}
            value={tDetail('participationTimes', { count: REGEAR_COUNT })}
          />
          <StatCard
            icon={<Crown size={14} className="text-rose-400" />}
            label={'Kill Rank'}
            value={`#${KILL_RANK}`}
            sub={`/${KILL_RANK_TOTAL}`}
            mono
          />
          <StatCard
            icon={<Trophy size={14} className="text-amber-400" />}
            label={'Participation Rank'}
            value={`#${PARTICIPATION_RANK}`}
            sub={`/${PARTICIPATION_RANK_TOTAL}`}
            mono
          />
        </StatSubGroup>
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

      <section data-tour-id="me-profile-weapons" className="space-y-3">
        <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
          <Swords size={14} className="text-amber-400" />
          {tDetail('weaponUsage')}
        </h2>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-2.5">
          {WEAPON_USAGE.map((w) => (
            <WeaponBar
              key={w.raw}
              label={w.raw}
              count={w.count}
              total={weaponTotal}
              t={tDetail}
            />
          ))}
        </div>
      </section>

      <section data-tour-id="me-profile-battles" className="space-y-3">
        <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
          <Flame size={14} className="text-orange-400" />
          {tDetail('killboardHeading')}
        </h2>
        <ul className="bg-gray-900 border border-gray-800 rounded-lg divide-y divide-gray-800">
          {RECENT_BATTLES.map((b) => (
            <li key={b.id} className="flex items-start gap-3 px-3 py-2.5 text-sm">
              <span
                className={`shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md border ${
                  b.outcome === 'kill'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                }`}
              >
                {b.outcome === 'kill' ? <Sword size={14} /> : <Skull size={14} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-white text-xs font-semibold truncate">
                  {b.opponent}
                  <span className="ml-1 text-gray-500 font-normal">[{b.opponentGuild}]</span>
                </p>
                <p className="text-gray-500 text-[10px] truncate">
                  {b.weaponRaw} · {b.zone}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-amber-300 text-xs font-mono font-bold tabular-nums">
                  {b.fame.toLocaleString()}
                </p>
                <p className="text-gray-600 text-[10px] font-mono">
                  {formatBattleTime(tDemo, b.time)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <Link
        href="/demo/me"
        className="inline-block text-xs text-gray-500 hover:text-amber-400 transition-colors"
      >
        ← /demo/me
      </Link>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta('members.title')}
        description={tCta('members.description')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}

function StatSubGroup({
  label,
  cols,
  children,
}: {
  label: string
  cols: 3 | 4 | 5
  children: React.ReactNode
}) {
  const gridClass =
    cols === 5
      ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
      : cols === 4
        ? 'grid-cols-2 sm:grid-cols-4'
        : 'grid-cols-1 sm:grid-cols-3'
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">{label}</p>
      <div className={`grid ${gridClass} gap-2`}>{children}</div>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
  mono,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  tone?: string
  mono?: boolean
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2">
      <div className="flex items-center gap-1.5 text-gray-400 text-[10px] font-semibold uppercase tracking-wider">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p
        className={`mt-1 text-base sm:text-lg font-semibold ${mono ? 'font-mono' : ''} ${
          tone ?? 'text-white'
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-gray-500 text-[10px] mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

function WeaponBar({
  label,
  count,
  total,
  t,
}: {
  label: string
  count: number
  total: number
  t: Awaited<ReturnType<typeof getTranslations<'memberDetail'>>>
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-medium text-gray-300 w-40 truncate">{label}</span>
      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-amber-500 to-amber-400"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[11px] font-mono text-gray-400 w-14 text-right">
        {t('weaponUsageCount', { count })}
      </span>
    </div>
  )
}
