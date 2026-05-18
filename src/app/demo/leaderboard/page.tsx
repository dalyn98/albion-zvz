import Link from 'next/link'
import { Sword, CalendarCheck, Heart, Target, Trophy, Swords } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { DEMO_MEMBERS } from '@/data/demo-seed'
import DemoCTACard from '../_components/DemoCTACard'

// 실제 /leaderboard 와 같은 5장(킬/참여/생존/KD/승률) 카드 구성. window 탭은
// 시각용 — 데모는 단일 시드라 클릭해도 데이터는 같음. /demo/leaderboard?window=
// search param 으로 활성 탭만 바뀐다.

type LeaderboardWindow = 'week' | 'month' | 'all'
const WINDOWS: ReadonlyArray<LeaderboardWindow> = ['week', 'month', 'all']

function isWindow(v: string | undefined): v is LeaderboardWindow {
  return v === 'week' || v === 'month' || v === 'all'
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

  const kills: Entry[] = [...DEMO_MEMBERS]
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 10)
    .map((m) => ({
      username: m.ign,
      value: m.kills,
      kills: m.kills,
      deaths: m.deaths,
    }))

  const participation: Entry[] = [...DEMO_MEMBERS]
    .map((m) => ({ username: m.ign, value: m.weeklyAttendance.attended }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  // 생존률은 battles ≥ 5 인 멤버만 — 실 leaderboard 와 동일 필터.
  const survival: Entry[] = [...DEMO_MEMBERS]
    .filter((m) => m.battles >= 5)
    .map((m) => ({
      username: m.ign,
      value: m.survivalPct,
      evaluatedEvents: m.battles,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)

  const kd: Entry[] = [...DEMO_MEMBERS]
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
  const winRate: Entry[] = [...DEMO_MEMBERS]
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
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 mb-1">
          <Trophy size={22} className="text-amber-400" />
          {t('title')}
        </h1>
        <p className="text-gray-400 text-sm">{t('description')}</p>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  href={`/demo/members/${encodeURIComponent(entry.username)}`}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800/70 hover:ring-1 hover:ring-amber-500/30 transition-all"
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
