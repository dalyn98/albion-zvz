import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Sword, CalendarCheck, Heart, Target, Trophy } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getLeaderboard, type LeaderboardEntry, type LeaderboardWindow } from '@/app/actions/leaderboard'
import MemberAvatar from '@/components/MemberAvatar'

export const dynamic = 'force-dynamic'

const WINDOWS: ReadonlyArray<LeaderboardWindow> = ['week', 'month', 'all']

function isWindow(v: string | undefined): v is LeaderboardWindow {
  return v === 'week' || v === 'month' || v === 'all'
}

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>
}) {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/leaderboard')
  }

  const params = await searchParams
  const window: LeaderboardWindow = isWindow(params.window) ? params.window : 'week'

  const [data, t] = await Promise.all([
    getLeaderboard(window),
    getTranslations('leaderboard'),
  ])

  return (
    <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 mb-1">
          <Trophy size={22} className="text-amber-400" />
          {t('title')}
        </h1>
        <p className="text-gray-400 text-sm">{t('description')}</p>
      </div>

      <nav className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
        {WINDOWS.map((w) => {
          const active = w === window
          return (
            <Link
              key={w}
              href={`/leaderboard?window=${w}`}
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

      {!data ? (
        <p className="text-gray-500 text-sm text-center py-8">{t('empty')}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <LeaderboardCard
            title={t('kills')}
            icon={<Sword size={16} className="text-red-400" />}
            entries={data.kills}
            emptyText={t('noEntries')}
            formatValue={(e) => e.value.toLocaleString()}
            subText={(e) =>
              e.deaths != null ? t('killsSub', { kills: e.kills ?? 0, deaths: e.deaths }) : undefined
            }
          />
          <LeaderboardCard
            title={t('participation')}
            icon={<CalendarCheck size={16} className="text-amber-400" />}
            entries={data.participation}
            emptyText={t('noEntries')}
            formatValue={(e) => t('participationUnit', { count: e.value })}
          />
          <LeaderboardCard
            title={t('survival')}
            icon={<Heart size={16} className="text-emerald-400" />}
            entries={data.survival}
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
            entries={data.kd}
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
            entries={data.winRate}
            emptyText={t('noEntriesWinRate')}
            formatValue={(e) => `${e.value}%`}
            subText={(e) =>
              e.wins != null && e.losses != null
                ? t('winLossSub', { wins: e.wins, losses: e.losses })
                : undefined
            }
          />
        </div>
      )}
    </main>
  )
}

interface LeaderboardCardProps {
  title: string
  icon: React.ReactNode
  entries: LeaderboardEntry[]
  emptyText: string
  formatValue: (entry: LeaderboardEntry) => string
  subText?: (entry: LeaderboardEntry) => string | undefined
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
              <li key={entry.discord_id}>
                <Link
                  href={`/members/${entry.discord_id}`}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800/70 transition-colors"
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
                  <MemberAvatar discordId={entry.discord_id} avatar={entry.avatar} size={24} />
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
