import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Pencil, ShieldAlert, ShieldCheck } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { listMyRegearRequests } from '@/app/actions/regear'
import { listMyExchangeRequests } from '@/app/actions/exchange'
import { listMyParticipation } from '@/app/actions/member'
import { listTransferCandidates } from '@/app/actions/transfer'
import { listMyDonationRequests } from '@/app/actions/donation'
import { getMyDashboard } from '@/app/actions/me-dashboard'
import { getMemberAlbionIdentity, isAlbionVerified } from '@/lib/albion-identity'
import { ALBION_SERVER_LABEL } from '@/lib/albion-gameinfo'
import { formatSilver } from '@/lib/silver'
import { formatDateTime } from '@/lib/format-datetime'
import { formatGatherTimeFor } from '@/lib/gather-time'
import { getLocale } from '@/lib/locale'
import { regearPayoutSilver } from '@/types'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import MyHomeDashboardCard from '@/components/MyHomeDashboardCard'
import BadgeGrid from '@/components/BadgeGrid'
import RequestExchangeForm from '@/components/RequestExchangeForm'
import ExchangeRequestActions from '@/components/ExchangeRequestActions'
import RegearRequestCancelButton from '@/components/RegearRequestCancelButton'
import TransferPointsForm from '@/components/TransferPointsForm'
import DonationRequestButton from '@/components/DonationRequestButton'
import DonationRequestCancelButton from '@/components/DonationRequestCancelButton'

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
  // Guests have no points/regear/exchange — skip the financial dashboard.
  if (!session.isMember) {
    redirect('/')
  }

  const [
    dashboard,
    { requests: regears },
    { requests: exchanges },
    { entries: participation },
    { candidates: transferCandidates },
    { requests: donations },
    albionIdentity,
    t,
    tStatus,
    tOnboarding,
    tRole,
    locale,
  ] = await Promise.all([
    getMyDashboard(),
    listMyRegearRequests(),
    listMyExchangeRequests(),
    listMyParticipation(),
    listTransferCandidates(),
    listMyDonationRequests(),
    getMemberAlbionIdentity(session.discordId),
    getTranslations('me'),
    getTranslations('status'),
    getTranslations('albionOnboarding'),
    getTranslations('slotRole'),
    getLocale(),
  ])

  const albionVerified = isAlbionVerified(albionIdentity)

  const balance = dashboard?.balance ?? 0
  const hasPendingExchange = exchanges.some((e) => e.status === 'pending')

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">{t('title')}</h1>
        <p className="text-gray-400 text-sm">{t('description')}</p>
      </div>

      <section
        className={`flex items-start gap-3 rounded-2xl border p-4 ${
          albionVerified
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
            : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200'
        }`}
      >
        {albionVerified ? (
          <ShieldCheck size={20} className="flex-shrink-0 mt-0.5" />
        ) : (
          <ShieldAlert size={20} className="flex-shrink-0 mt-0.5" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold">
            {albionVerified ? tOnboarding('profileBadgeVerified') : tOnboarding('profileBadgeUnverified')}
            {albionIdentity?.nickname && (
              <span className="ml-2 text-xs opacity-80 font-mono">
                {albionIdentity.nickname}
                {albionIdentity.server && (
                  <span className="ml-1 opacity-70">· {ALBION_SERVER_LABEL[albionIdentity.server]}</span>
                )}
              </span>
            )}
          </p>
          <p className="text-xs leading-relaxed opacity-80">
            {albionVerified
              ? tOnboarding('profileNoteVerified')
              : tOnboarding('profileNoteUnverified')}
          </p>
          {!albionVerified && (
            <Link
              href="/onboarding/albion?return=%2Fme"
              className="inline-block mt-1 text-xs underline underline-offset-2 font-semibold hover:opacity-80"
            >
              {tOnboarding('profileCtaVerify')}
            </Link>
          )}
        </div>
      </section>

      {dashboard && <MyHomeDashboardCard data={dashboard} />}

      {dashboard && (
        <BadgeGrid
          input={{
            participationCount: dashboard.participationCount,
            kills: dashboard.kills,
            deathlessLongestStreak: dashboard.longestDeathlessStreak,
            survivalRate: dashboard.survivalRate,
            evaluatedEvents: dashboard.evaluatedEvents,
            participationLongestStreak: dashboard.participationLongestStreak,
            wins: dashboard.wins,
          }}
        />
      )}

      <section className="bg-gray-900 border border-gray-700 rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
        <p className="text-gray-500 text-[11px] leading-relaxed min-w-0 flex-1">
          {t('transferDescription')}
        </p>
        <TransferPointsForm balance={balance} candidates={transferCandidates} />
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
                      {e.handled_by_username && (
                        <span className="ml-2 text-gray-600">
                          · {t('handledBy', { handler: e.handled_by_username })}
                        </span>
                      )}
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
          <h2 className="text-lg font-bold text-white">{t('donationTitle')}</h2>
          <DonationRequestButton />
        </div>
        <p className="text-gray-400 text-xs leading-relaxed">{t('donationDescription')}</p>
        {donations.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">{t('noDonations')}</p>
        ) : (
          <ul className="space-y-2">
            {donations.map((d) => (
              <li
                key={d.id}
                className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-white text-sm font-mono">
                    {t('donationAmount', { amount: formatSilver(d.silver) })}
                  </p>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 ${STATUS_CLASS[d.status]}`}>
                    {tStatus(d.status)}
                  </span>
                </div>
                {d.memo && (
                  <p className="text-gray-400 text-xs whitespace-pre-wrap">{d.memo}</p>
                )}
                {d.admin_notes && (
                  <p className="text-gray-500 text-xs truncate">{d.admin_notes}</p>
                )}
                <p className="text-gray-600 text-xs font-mono">
                  {t('requestedAt', { when: formatDateTime(d.created_at) })}
                  {d.resolved_at && d.status !== 'pending' && (
                    <span className="ml-2">
                      · {tStatus(d.status)} {formatDateTime(d.resolved_at)}
                      {d.handled_by_username && (
                        <span className="ml-1 text-gray-700">
                          · {t('handledBy', { handler: d.handled_by_username })}
                        </span>
                      )}
                    </span>
                  )}
                </p>
                {d.status === 'pending' && <DonationRequestCancelButton id={d.id} />}
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
              {t('participationCount', { count: participation.length })}
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
                      {p.role_name && <span className="ml-2 text-gray-400">· {translateSlotRole(p.role_name, tRole)}</span>}
                    </p>
                  </div>
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
                  <span>{r.role_name ? translateSlotRole(r.role_name, tRole) : ''}</span>
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
                      {r.handled_by_username && (
                        <span className="ml-1 text-gray-700">
                          · {t('handledBy', { handler: r.handled_by_username })}
                        </span>
                      )}
                    </span>
                  )}
                </p>
                {r.status === 'pending' && (
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.auto_generated && (
                      <Link
                        href={`/me/regear/${r.id}`}
                        className="inline-flex items-center gap-1 text-xs text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded mt-1"
                      >
                        <Pencil size={11} />
                        {t('regearEditBreakdown')}
                      </Link>
                    )}
                    <RegearRequestCancelButton id={r.id} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
