import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Sword, CalendarCheck, Heart, Target, Trophy, Swords, Sparkles } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getLeaderboard, type LeaderboardEntry, type LeaderboardWindow } from '@/app/actions/leaderboard'
import MemberAvatar from '@/components/MemberAvatar'
import { buildLoginEntryHref, buildReturnToWithSearchParams } from '@/lib/login-entry'

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
  const [session, params] = await Promise.all([getSession(), searchParams])
  if (!session) {
    const returnParams = new URLSearchParams()
    if (params.window) returnParams.set('window', params.window)
    redirect(buildLoginEntryHref({
      returnTo: buildReturnToWithSearchParams('/leaderboard', returnParams),
    }))
  }

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

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <nav className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
          {WINDOWS.map((w) => {
            const active = w === window
            return (
              <Link
                key={w}
                href={`/leaderboard?window=${w}`}
                className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 ${
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
        {data && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300/80 bg-emerald-500/5 border border-emerald-500/20 rounded-full px-2.5 py-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            {t('justUpdated')}
          </span>
        )}
      </div>

      {!data ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Sparkles size={28} className="text-amber-400/60 mb-3" />
          <p className="text-gray-300 text-sm font-medium">{t('empty')}</p>
          <p className="text-gray-500 text-xs mt-1 max-w-sm">{t('emptyHint')}</p>
        </div>
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
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2 transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-glow">
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
            // 연동 멤버는 Discord 멤버 상세, 미연동은 albion 슬림 상세로.
            const href = entry.discord_id
              ? `/members/${entry.discord_id}`
              : `/members/albion/${entry.albion_player_id}`
            const isTopRank = rank === 1
            return (
              <li
                key={entry.albion_player_id}
                className="lb-row-in"
                style={{ animationDelay: `${idx * 40}ms` }}
              >
                <Link
                  href={href}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                    isTopRank
                      ? 'bg-amber-500/5 hover:bg-amber-500/10 lb-rank1-glow'
                      : 'hover:bg-gray-800/70'
                  }`}
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
                  {entry.discord_id ? (
                    <MemberAvatar discordId={entry.discord_id} avatar={entry.avatar} size={24} />
                  ) : (
                    <span className="w-6 h-6 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center flex-shrink-0">
                      <Swords size={12} className="text-gray-500" />
                    </span>
                  )}
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
