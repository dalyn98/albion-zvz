import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Coins, Trophy, ShieldAlert, Hourglass } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { listMyRegearRequests, getMyPointsSummary } from '@/app/actions/regear'
import { listMyExchangeRequests } from '@/app/actions/exchange'
import { listMyParticipation } from '@/app/actions/member'
import { formatSilver } from '@/lib/silver'
import { formatDateTime } from '@/lib/format-datetime'
import { formatGatherTimeFor } from '@/lib/gather-time'
import { getLocale } from '@/lib/locale'
import { regearPayoutSilver } from '@/types'
import RequestExchangeForm from '@/components/RequestExchangeForm'
import ExchangeRequestActions from '@/components/ExchangeRequestActions'
import RegearRequestCancelButton from '@/components/RegearRequestCancelButton'

export const dynamic = 'force-dynamic'

const STATUS_CLASS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-300',
  approved: 'bg-green-500/20 text-green-300',
  rejected: 'bg-gray-700 text-gray-300',
}

export default async function MePage() {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/me')
  }

  const [
    { summary },
    { requests: regears },
    { requests: exchanges },
    { entries: participation },
    t,
    tStatus,
    locale,
  ] = await Promise.all([
    getMyPointsSummary(),
    listMyRegearRequests(),
    listMyExchangeRequests(),
    listMyParticipation(),
    getTranslations('me'),
    getTranslations('status'),
    getLocale(),
  ])

  const balance = summary?.balance ?? 0
  const hasPendingExchange = exchanges.some((e) => e.status === 'pending')
  const wins = participation.filter((p) => p.outcome === 'win').length
  const losses = participation.filter((p) => p.outcome === 'loss').length

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">{t('title')}</h1>
        <p className="text-gray-400 text-sm">{t('description')}</p>
      </div>

      <section className="bg-gray-900 border border-gray-700 rounded-2xl p-5 sm:p-6">
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-1">{t('myPoints')}</p>
        <div className="flex items-baseline gap-2">
          <Coins size={28} className="text-amber-400" />
          <span className="text-3xl sm:text-4xl font-bold text-white font-mono">
            {formatSilver(balance)}
          </span>
        </div>
        {summary && (
          <p className="text-gray-500 text-xs mt-2">
            {t('summary', {
              earned: formatSilver(summary.lifetimeEarned),
              spent: formatSilver(summary.lifetimeSpent),
            })}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">{t('exchangeTitle')}</h2>
        <p className="text-gray-400 text-xs leading-relaxed">{t('exchangeDescription')}</p>
        <RequestExchangeForm balance={balance} disabled={hasPendingExchange} />
        {exchanges.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">{t('noExchanges')}</p>
        ) : (
          <ul className="space-y-2">
            {exchanges.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm font-mono">{formatSilver(e.silver)}</p>
                  <p className="text-gray-500 text-xs">{t('requestedAt', { when: formatDateTime(e.created_at) })}</p>
                  {e.resolved_at && e.status !== 'pending' && (
                    <p className="text-gray-500 text-xs">
                      {tStatus(e.status)} {formatDateTime(e.resolved_at)}
                    </p>
                  )}
                  {e.admin_notes && (
                    <p className="text-gray-400 text-xs mt-1 truncate">{t('reason', { text: e.admin_notes })}</p>
                  )}
                  {e.status === 'pending' && (
                    <ExchangeRequestActions id={e.id} silver={e.silver} />
                  )}
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS[e.status]}`}>
                  {tStatus(e.status)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-white">{t('participationTitle')}</h2>
          {participation.length > 0 && (
            <p className="text-xs text-gray-400">
              <span className="text-emerald-300 font-semibold">{t('winsCount', { count: wins })}</span>
              <span className="mx-1.5 text-gray-600">·</span>
              <span className="text-rose-300 font-semibold">{t('lossesCount', { count: losses })}</span>
            </p>
          )}
        </div>
        {participation.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">{t('noParticipation')}</p>
        ) : (
          <ul className="space-y-2">
            {participation.map((p) => (
              <li
                key={p.event_id}
                className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3"
              >
                <Link href={`/events/${p.event_id}`} className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-medium truncate">{p.event_title}</p>
                    <p className="text-gray-500 text-xs">
                      {p.gather_at ? formatGatherTimeFor(locale, p.gather_at) : p.gather_time}
                      {p.role_name && <span className="ml-2 text-gray-400">· {p.role_name}</span>}
                    </p>
                  </div>
                  <ParticipationOutcomeBadge
                    outcome={p.outcome}
                    labels={{
                      win: t('outcomeWin'),
                      loss: t('outcomeLoss'),
                      pending: t('outcomePending'),
                    }}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-white">{t('regearListTitle')}</h2>
        {regears.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">{t('noRegears')}</p>
        ) : (
          <ul className="space-y-2">
            {regears.map((r) => (
              <li
                key={r.id}
                className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white text-sm font-medium truncate">{r.event_title}</p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS[r.status]}`}>
                    {tStatus(r.status)}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
                  <span>{r.role_name}</span>
                  <span className="font-mono text-amber-400">
                    {t('claimed')} {formatSilver(regearPayoutSilver(r))}
                    <span className="text-gray-500"> / {t('ceiling')} {formatSilver(r.silver)}</span>
                  </span>
                  {!r.killboard_verified && r.status === 'pending' && (
                    <span className="text-yellow-400">{t('killboardUnverified')}</span>
                  )}
                </div>
                {r.admin_notes && (
                  <p className="text-gray-500 text-xs truncate">{r.admin_notes}</p>
                )}
                <p className="text-gray-600 text-xs font-mono">
                  {t('requestedAt', { when: formatDateTime(r.created_at) })}
                  {r.resolved_at && r.status !== 'pending' && (
                    <span className="ml-2">
                      · {tStatus(r.status)} {formatDateTime(r.resolved_at)}
                    </span>
                  )}
                </p>
                {r.status === 'pending' && <RegearRequestCancelButton id={r.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function ParticipationOutcomeBadge({
  outcome,
  labels,
}: {
  outcome: 'win' | 'loss' | null
  labels: { win: string; loss: string; pending: string }
}) {
  if (outcome === 'win') {
    return (
      <span className="inline-flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0">
        <Trophy size={11} />
        {labels.win}
      </span>
    )
  }
  if (outcome === 'loss') {
    return (
      <span className="inline-flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 text-rose-200 text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0">
        <ShieldAlert size={11} />
        {labels.loss}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 bg-gray-700 text-gray-300 text-xs font-bold px-2.5 py-1 rounded-full flex-shrink-0">
      <Hourglass size={11} />
      {labels.pending}
    </span>
  )
}
