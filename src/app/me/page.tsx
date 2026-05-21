import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  CalendarDays,
  ChevronRight,
  Coins,
  ListChecks,
  ShieldAlert,
  ShieldCheck,
  Swords,
  Trophy,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { listMyExchangeRequests } from '@/app/actions/exchange'
import { listMyParticipation } from '@/app/actions/member'
import { listTransferCandidates } from '@/app/actions/transfer'
import { getMyDashboard } from '@/app/actions/me-dashboard'
import { getMemberAlbionIdentity, isAlbionVerified } from '@/lib/albion-identity'
import { getAppSetting } from '@/lib/app-settings'
import { getSessionGuildId } from '@/lib/tenant'
import { ALBION_SERVER_LABEL_KEY } from '@/lib/albion-gameinfo'
import { formatGatherTimeFor } from '@/lib/gather-time'
import { getLocale } from '@/lib/locale'
import { getTenantTimezone } from '@/lib/timezone-server'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { formatSilver } from '@/lib/silver'
import MyHomeDashboardCard from '@/components/MyHomeDashboardCard'
import MemberNextActionsPanel from '@/components/MemberNextActionsPanel'
import BadgeGrid from '@/components/BadgeGrid'
import RequestExchangeForm from '@/components/RequestExchangeForm'
import TransferPointsForm from '@/components/TransferPointsForm'
import DonationRequestButton from '@/components/DonationRequestButton'
import MyCraftPickupsSection from '@/components/MyCraftPickupsSection'

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
    weeklyStatsEnabledRaw,
    t,
    tRequests,
    tOnboarding,
    tRole,
    tCommon,
    locale,
    tz,
  ] = await Promise.all([
    getMyDashboard(),
    listMyExchangeRequests(),
    listMyParticipation(),
    listTransferCandidates(),
    getMemberAlbionIdentity(session.discordId, guildId),
    // 길드별 토글 — 기본 OFF. SaaS 다른 테넌트에는 노출하지 않는다. 우리 길드는
    // 별도 SQL upsert 로 'true' 설정.
    getAppSetting('me_weekly_stats_enabled', 'false', guildId),
    getTranslations('me'),
    getTranslations('myRequests'),
    getTranslations('albionOnboarding'),
    getTranslations('slotRole'),
    getTranslations('common'),
    getLocale(),
    getTenantTimezone(guildId),
  ])

  const weeklyStatsEnabled = weeklyStatsEnabledRaw === 'true'

  const albionVerified = isAlbionVerified(albionIdentity)

  const balance = dashboard?.balance ?? 0
  const pendingExchange = exchanges.find((e) => e.status === 'pending') ?? null
  const hasPendingExchange = !!pendingExchange
  const pendingTotal =
    (dashboard?.pendingRegearCount ?? 0) +
    (dashboard?.pendingExchangeCount ?? 0) +
    (dashboard?.pendingDonationCount ?? 0)
  const nextEventForAction = dashboard?.nextUpcomingEvent
    ? {
        id: dashboard.nextUpcomingEvent.id,
        title: dashboard.nextUpcomingEvent.title,
        subtitle: [
          dashboard.nextUpcomingEvent.gather_at
            ? formatGatherTimeFor(locale, dashboard.nextUpcomingEvent.gather_at, tz)
            : dashboard.nextUpcomingEvent.gather_time,
          dashboard.nextUpcomingEvent.role_name
            ? translateSlotRole(dashboard.nextUpcomingEvent.role_name, tRole)
            : null,
        ].filter(Boolean).join(' · '),
      }
    : null

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
                  <span className="ml-1 opacity-70">· {tCommon(ALBION_SERVER_LABEL_KEY[albionIdentity.server])}</span>
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

      <MemberNextActionsPanel
        albionVerified={albionVerified}
        pendingTotal={pendingTotal}
        nextEvent={nextEventForAction}
        labels={{
          title: t('actionTitle'),
          description: t('actionDescription'),
          verifyTitle: t('actionVerifyTitle'),
          verifyBody: t('actionVerifyBody'),
          requestsTitle: t('actionRequestsTitle'),
          requestsBody: t('actionRequestsBody', { count: pendingTotal }),
          nextEventTitle: t('actionNextEventTitle'),
          noItemsTitle: t('actionNoItemsTitle'),
          noItemsBody: t('actionNoItemsBody'),
          open: t('actionOpen'),
        }}
      />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <QuickLinkCard
          href="/"
          icon={<CalendarDays size={16} />}
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
          href="/regear"
          icon={<Swords size={16} />}
          title={t('quickRegearTitle')}
          body={t('quickRegearBody')}
        />
        <QuickLinkCard
          href="/leaderboard"
          icon={<Trophy size={16} />}
          title={t('quickLeaderboardTitle')}
          body={t('quickLeaderboardBody')}
        />
      </section>

      {dashboard && (
        <MyHomeDashboardCard data={dashboard} weeklyStatsEnabled={weeklyStatsEnabled} />
      )}

      <MyCraftPickupsSection />

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

      <section id="wallet" className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4 scroll-mt-20">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-white">{t('walletTitle')}</h2>
            <p className="text-gray-400 text-xs leading-relaxed mt-1">{t('walletDescription')}</p>
          </div>
          <Link
            href="/me/requests"
            className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200"
          >
            <ListChecks size={14} />
            {t('walletHistoryLink')}
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <WalletMetric
            label={t('walletBalanceLabel')}
            value={formatSilver(balance)}
            accent
          />
          <WalletMetric
            label={t('walletExchangeLabel')}
            value={pendingExchange ? formatSilver(pendingExchange.silver) : t('walletNoPending')}
            sub={pendingExchange ? t('walletPendingExchange') : t('walletExchangeReady')}
          />
          <WalletMetric
            label={t('walletLifetimeLabel')}
            value={
              dashboard
                ? t('walletLifetimeValue', {
                    earned: formatSilver(dashboard.lifetimeEarned),
                    spent: formatSilver(dashboard.lifetimeSpent),
                  })
                : '-'
            }
            sub={t('walletLifetimeSub')}
          />
        </div>
        <div className="border-t border-gray-800 pt-4 space-y-3">
          <h3 className="text-sm font-bold text-white">{t('exchangeTitle')}</h3>
          <p className="text-gray-400 text-xs leading-relaxed">{t('exchangeDescription')}</p>
          <RequestExchangeForm balance={balance} disabled={hasPendingExchange} />
        </div>
        <div className="border-t border-gray-800 pt-4 flex items-center justify-between gap-3">
          <p className="text-gray-500 text-[11px] leading-relaxed min-w-0 flex-1">
            {t('transferDescription')}
          </p>
          <TransferPointsForm balance={balance} candidates={transferCandidates} />
        </div>
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
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold font-mono ${accent ? 'text-amber-300' : 'text-white'}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-gray-500">{sub}</p>}
    </div>
  )
}
