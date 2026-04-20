import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { ArrowLeft, Trophy, ShieldAlert, Flag } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getBattlesAgainst } from '@/app/actions/battle-records'
import { formatDateTime } from '@/lib/format-datetime'

export const dynamic = 'force-dynamic'

export default async function GuildBattleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getSession()
  if (!session) {
    redirect(`/api/auth/discord/start?returnTo=/battle-records/${id}`)
  }

  const [{ guild, events, error }, t] = await Promise.all([
    getBattlesAgainst(id),
    getTranslations('battleRecords'),
  ])

  if (!guild) notFound()

  const totalWins = events.reduce(
    (sum, e) => sum + e.battles.filter((b) => b.outcome === 'win').length,
    0,
  )
  const totalLosses = events.reduce(
    (sum, e) => sum + e.battles.filter((b) => b.outcome === 'loss').length,
    0,
  )
  const total = totalWins + totalLosses
  const winRate = total > 0 ? Math.round((totalWins / total) * 100) : 0

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-5">
      <Link
        href="/battle-records"
        className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-sm transition-colors"
      >
        <ArrowLeft size={14} />
        {t('backToList')}
      </Link>

      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 space-y-3">
        <div className="flex items-start gap-3">
          <Flag size={22} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-white">{guild.name}</h1>
            {guild.notes && (
              <p className="text-gray-400 text-sm mt-1 whitespace-pre-wrap">{guild.notes}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 pt-2 border-t border-gray-800">
          <div className="flex items-center gap-1.5">
            <Trophy size={14} className="text-emerald-300" />
            <span className="text-xs text-gray-400">{t('wins')}</span>
            <span className="text-base font-bold text-emerald-300 font-mono">{totalWins}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldAlert size={14} className="text-rose-300" />
            <span className="text-xs text-gray-400">{t('losses')}</span>
            <span className="text-base font-bold text-rose-300 font-mono">{totalLosses}</span>
          </div>
          <div className="text-xs text-gray-500">{t('winRate', { rate: winRate })}</div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-6">{t('detailEmpty')}</p>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => {
            const wins = e.battles.filter((b) => b.outcome === 'win').length
            const losses = e.battles.length - wins
            return (
              <li key={e.event_id}>
                <Link
                  href={`/events/${e.event_id}`}
                  className="block bg-gray-900 border border-gray-800 hover:border-amber-500/40 rounded-lg px-4 py-3 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-white text-sm font-semibold truncate">{e.event_title}</p>
                      {e.event_started_at && (
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          {formatDateTime(e.event_started_at)}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="flex items-center gap-1 text-emerald-300 text-xs">
                        <Trophy size={11} />
                        {wins}
                      </span>
                      <span className="flex items-center gap-1 text-rose-300 text-xs">
                        <ShieldAlert size={11} />
                        {losses}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
