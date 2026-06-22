import Link from 'next/link'
import { Sword, CalendarCheck, Heart, Target, Trophy, Swords } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { DEMO_MEMBERS } from '@/data/demo-seed'
import DemoCTACard from '../_components/DemoCTACard'
import DemoGuidedTour from '../_components/DemoGuidedTour'

// 실제 /leaderboard 와 같은 5장(킬/참여/생존/KD/승률) 카드 구성. window 탭은
// 주/월/전체 누적 분량과 멤버별 안정적 변동을 함께 적용해, 각 윈도우가 진짜로
// 다른 데이터처럼 보이도록 한다. /demo/leaderboard?window= search param 으로
// 활성 탭만 바뀐다.

type LeaderboardWindow = 'week' | 'month' | 'all'
const WINDOWS: ReadonlyArray<LeaderboardWindow> = ['week', 'month', 'all']
const LEADERBOARD_TOUR_STEPS = [
  { id: 'leaderboard-window' },
  { id: 'leaderboard-cards' },
  { id: 'leaderboard-member-link' },
] as const

function isWindow(v: string | undefined): v is LeaderboardWindow {
  return v === 'week' || v === 'month' || v === 'all'
}

// 주 = 1배, 월 = 4주 누적, 전체 = ~4개월. 멤버별 변동은 ign 해시로 결정적.
const WINDOW_VOLUME: Record<LeaderboardWindow, number> = {
  week: 1,
  month: 4,
  all: 16,
}

// ign + windowKey 로 결정적 변동 (0.85 ~ 1.15). 멤버마다 윈도우별로 약간씩
// 순위가 흔들려, 단일 시드여도 "다른 기간" 처럼 보인다.
function windowJitter(ign: string, windowKey: LeaderboardWindow): number {
  const seed = windowKey === 'week' ? 11 : windowKey === 'month' ? 137 : 271
  let h = seed
  for (let i = 0; i < ign.length; i += 1) {
    h = (h * 31 + ign.charCodeAt(i)) % 1000
  }
  return 0.85 + (h / 1000) * 0.3
}

// 생존률·승률 같은 비율 지표는 윈도우별로 작은 변동만 (±4% 포인트).
function pctJitter(ign: string, windowKey: LeaderboardWindow): number {
  const seed = windowKey === 'week' ? 7 : windowKey === 'month' ? 53 : 191
  let h = seed
  for (let i = 0; i < ign.length; i += 1) {
    h = (h * 17 + ign.charCodeAt(i)) % 1000
  }
  return ((h / 1000) - 0.5) * 8 // -4 ~ +4
}

function clampPct(v: number): number {
  if (v < 0) return 0
  if (v > 100) return 100
  return Math.round(v)
}

type Entry = {
  username: string
  value: number
  kills?: number
  deaths?: number
  evaluatedEvents?: number
  wins?: number
  losses?: number
}

export default async function DemoLeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>
}) {
  const params = await searchParams
  const windowKey: LeaderboardWindow = isWindow(params.window) ? params.window : 'week'

  const [t, tCta] = await Promise.all([
    getTranslations('leaderboard'),
    getTranslations('demo.ctaCard'),
  ])

  const volume = WINDOW_VOLUME[windowKey]

  // 윈도우별 누적값. 멤버마다 결정적 jitter 를 곱해 순위가 미세하게 흔들리도록.
  const scaled = DEMO_MEMBERS.map((m) => {
    const j = windowJitter(m.ign, windowKey)
    const kills = Math.max(0, Math.round(m.kills * volume * j))
    const deaths = Math.max(0, Math.round(m.deaths * volume * j))
    const battles = Math.max(1, Math.round(m.battles * volume * j))
    const attended = Math.max(0, Math.round(m.weeklyAttendance.attended * volume * j))
    const survivalPct = clampPct(m.survivalPct + pctJitter(m.ign, windowKey))
    return { ign: m.ign, kills, deaths, battles, attended, survivalPct }
  })

  const kills: Entry[] = [...scaled]
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 10)
    .map((m) => ({
      username: m.ign,
      value: m.kills,
      kills: m.kills,
      deaths: m.deaths,
    }))

  const participation: Entry[] = [...scaled]
    .map((m) => ({ username: m.ign, value: m.attended }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  // 생존률은 battles ≥ 5 인 멤버만 — 실 leaderboard 와 동일 필터.
  const survival: Entry[] = [...scaled]
    .filter((m) => m.battles >= 5)
    .map((m) => ({
      username: m.ign,
      value: m.survivalPct,
      evaluatedEvents: m.battles,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  const kd: Entry[] = [...scaled]
    .filter((m) => m.kills + m.deaths >= 5)
    .map((m) => ({
      username: m.ign,
      value: m.deaths === 0 ? m.kills : Math.round((m.kills / m.deaths) * 100) / 100,
      kills: m.kills,
      deaths: m.deaths,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  // 승률은 시드에 없으니 survivalPct 를 그대로 차용 — 데모 컨텍스트에서 "근사치" 표시.
  const winRate: Entry[] = [...scaled]
    .filter((m) => m.battles >= 5)
    .map((m) => {
      const wins = Math.round(m.battles * (m.survivalPct / 100))
      const losses = m.battles - wins
      return {
        username: m.ign,
        value: Math.round((wins / m.battles) * 100),
        wins,
        losses,
      }
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  return (
    <div className="space-y-6">
      <DemoGuidedTour steps={LEADERBOARD_TOUR_STEPS} namespace="leaderboard" />
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 mb-1">
          <Trophy size={22} className="text-amber-400" />
          {t('title')}
        </h1>
        <p className="text-gray-400 text-sm">{t('description')}</p>
      </div>

      <div data-tour-id="leaderboard-window" className="flex items-center justify-between gap-2 flex-wrap">
        <nav className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
          {WINDOWS.map((w) => {
            const active = w === windowKey
            return (
              <Link
                key={w}
                href={`/demo/leaderboard?window=${w}`}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {t(`window.${w}`)}
              </Link>
            )
          })}
        </nav>
      </div>

      <div data-tour-id="leaderboard-cards" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LeaderboardCard
          title={t('kills')}
          icon={<Sword size={16} className="text-red-400" />}
          entries={kills}
          emptyText={t('noEntries')}
          formatValue={(e) => e.value.toLocaleString()}
          subText={(e) =>
            e.deaths != null ? t('killsSub', { kills: e.kills ?? 0, deaths: e.deaths }) : undefined
          }
        />
        <LeaderboardCard
          title={t('participation')}
          icon={<CalendarCheck size={16} className="text-amber-400" />}
          entries={participation}
          emptyText={t('noEntries')}
          formatValue={(e) => t('participationUnit', { count: e.value })}
        />
        <LeaderboardCard
          title={t('survival')}
          icon={<Heart size={16} className="text-emerald-400" />}
          entries={survival}
          emptyText={t('noEntriesSurvival')}
          formatValue={(e) => `${e.value}%`}
          subText={(e) =>
            e.evaluatedEvents != null
              ? t('evaluatedSub', { count: e.evaluatedEvents })
              : undefined
          }
        />
        <LeaderboardCard
          title={t('kd')}
          icon={<Target size={16} className="text-amber-300" />}
          entries={kd}
          emptyText={t('noEntriesKd')}
          formatValue={(e) => e.value.toFixed(2)}
          subText={(e) =>
            e.kills != null && e.deaths != null
              ? t('kdSub', { kills: e.kills, deaths: e.deaths })
              : undefined
          }
        />
        <LeaderboardCard
          title={t('winRate')}
          icon={<Trophy size={16} className="text-amber-400" />}
          entries={winRate}
          emptyText={t('noEntriesWinRate')}
          formatValue={(e) => `${e.value}%`}
          subText={(e) =>
            e.wins != null && e.losses != null
              ? t('winLossSub', { wins: e.wins, losses: e.losses })
              : undefined
          }
        />
      </div>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tCta('members.title')}
        description={tCta('members.description')}
        buttonLabel={tCta('buttonLabel')}
      />
    </div>
  )
}

interface LeaderboardCardProps {
  title: string
  icon: React.ReactNode
  entries: Entry[]
  emptyText: string
  formatValue: (entry: Entry) => string
  subText?: (entry: Entry) => string | undefined
}

function LeaderboardCard({
  title,
  icon,
  entries,
  emptyText,
  formatValue,
  subText,
}: LeaderboardCardProps) {
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
      <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
        {icon}
        {title}
      </h2>
      {entries.length === 0 ? (
        <p className="text-gray-500 text-xs text-center py-6">{emptyText}</p>
      ) : (
        <ol className="space-y-1">
          {entries.map((entry, idx) => {
            const rank = idx + 1
            const sub = subText?.(entry)
            return (
              <li key={entry.username}>
                <Link
                  data-tour-id={idx === 0 ? 'leaderboard-member-link' : undefined}
                  href={`/demo/members/${encodeURIComponent(entry.username)}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-[background-color,box-shadow] duration-150 ease-out hover:bg-gray-800/70 hover:ring-1 hover:ring-amber-500/30"
                >
                  <span
                    className={`w-6 text-center text-xs font-bold tabular-nums flex-shrink-0 ${
                      rank === 1
                        ? 'text-amber-400'
                        : rank === 2
                          ? 'text-slate-300'
                          : rank === 3
                            ? 'text-orange-400'
                            : 'text-gray-500'
                    }`}
                  >
                    {rank}
                  </span>
                  <span className="w-6 h-6 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
                    <Swords size={12} className="text-gray-500" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-xs font-medium truncate">{entry.username}</p>
                    {sub && <p className="text-gray-500 text-[10px] truncate">{sub}</p>}
                  </div>
                  <span className="text-amber-300 text-sm font-mono font-bold tabular-nums flex-shrink-0">
                    {formatValue(entry)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
