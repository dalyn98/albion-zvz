import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronRight, ShieldAlert, ShieldCheck } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { listMyExchangeRequests } from '@/app/actions/exchange'
import { listMyParticipation } from '@/app/actions/member'
import { listTransferCandidates } from '@/app/actions/transfer'
import { getMyDashboard } from '@/app/actions/me-dashboard'
import { getMemberAlbionIdentity, isAlbionVerified } from '@/lib/albion-identity'
import { getSessionGuildId } from '@/lib/tenant'
import { ALBION_SERVER_LABEL } from '@/lib/albion-gameinfo'
import { formatGatherTimeFor } from '@/lib/gather-time'
import { getLocale } from '@/lib/locale'
import { getTenantTimezone } from '@/lib/timezone-server'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import MyHomeDashboardCard from '@/components/MyHomeDashboardCard'
import BadgeGrid from '@/components/BadgeGrid'
import RequestExchangeForm from '@/components/RequestExchangeForm'
import TransferPointsForm from '@/components/TransferPointsForm'
import DonationRequestButton from '@/components/DonationRequestButton'

export const dynamic = 'force-dynamic'

export default async function MePage() {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/me')
  }
  // Guests have no points/regear/exchange — skip the financial dashboard.
  if (!session.isMember) {
    redirect('/')
  }

  const guildId = await getSessionGuildId(session)

  const [
    dashboard,
    { requests: exchanges },
    { entries: participation },
    { candidates: transferCandidates },
    albionIdentity,
    t,
    tRequests,
    tOnboarding,
    tRole,
    locale,
    tz,
  ] = await Promise.all([
    getMyDashboard(),
    listMyExchangeRequests(),
    listMyParticipation(),
    listTransferCandidates(),
    getMemberAlbionIdentity(session.discordId, guildId),
    getTranslations('me'),
    getTranslations('myRequests'),
    getTranslations('albionOnboarding'),
    getTranslations('slotRole'),
    getLocale(),
    getTenantTimezone(guildId),
  ])

  const albionVerified = isAlbionVerified(albionIdentity)

  const balance = dashboard?.balance ?? 0
  const hasPendingExchange = exchanges.some((e) => e.status === 'pending')
  const pendingTotal =
    (dashboard?.pendingRegearCount ?? 0) +
    (dashboard?.pendingExchangeCount ?? 0) +
    (dashboard?.pendingDonationCount ?? 0)

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

      <Link
        href="/me/requests"
        className="flex items-center justify-between gap-3 bg-gray-900 border border-gray-700 hover:border-amber-500/40 rounded-2xl px-4 py-3 transition-colors group"
      >
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-semibold">{tRequests('cardTitle')}</p>
          <p className="text-gray-500 text-xs mt-0.5">
            {pendingTotal > 0
              ? tRequests('cardSubtitlePending', { count: pendingTotal })
              : tRequests('cardSubtitle')}
          </p>
        </div>
        <ChevronRight size={18} className="text-gray-500 group-hover:text-amber-400 flex-shrink-0" />
      </Link>

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
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold text-white">{t('donationTitle')}</h2>
          <DonationRequestButton />
        </div>
        <p className="text-gray-400 text-xs leading-relaxed">{t('donationDescription')}</p>
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
                      {p.gather_at ? formatGatherTimeFor(locale, p.gather_at, tz) : p.gather_time}
                      {p.role_name && <span className="ml-2 text-gray-400">· {translateSlotRole(p.role_name, tRole)}</span>}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
