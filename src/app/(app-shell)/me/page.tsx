import Link from 'next/link'
import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import {
  CalendarDays,
  ChevronRight,
  Coins,
  History,
  ListChecks,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  Store,
  Swords,
  Trophy,
  UserCircle2,
  Zap,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { listMyExchangeRequests } from '@/app/actions/exchange'
import { listMyParticipation } from '@/app/actions/member'
import { getMyDashboard } from '@/app/actions/me-dashboard'
import { getMyMemberTradePointSummary } from '@/app/actions/member-trade'
import { listMyRegearEligibleEvents } from '@/app/actions/regear'
import {
  getMySiphonAccount,
  type MySiphonAccountResult,
} from '@/app/actions/siphon-member'
import {
  getMemberAlbionIdentity,
  isAlbionVerified,
} from '@/lib/albion-identity'
import {
  canUseManualRegearFeature,
  canUseGuildResourceFeatures,
  getAccountAlbionIdentityView,
} from '@/lib/account-albion-identity'
import { getAppSetting } from '@/lib/app-settings'
import { getSessionGuildId, getTenantDiscordConfig } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { ALBION_SERVER_LABEL_KEY } from '@/lib/albion-gameinfo'
import { displayNameFromSlug } from '@/lib/tenant-slug'
import { formatGatherTimeFor } from '@/lib/gather-time'
import { getLocale } from '@/lib/locale'
import { formatDateTime } from '@/lib/format-datetime'
import { getTenantTimezone } from '@/lib/timezone-server'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { getPointBalancesByGuildForMember } from '@/lib/point-ledger'
import { formatSilver } from '@/lib/silver'
import MyHomeDashboardCard from '@/components/MyHomeDashboardCard'
import MemberNextActionsPanel from '@/components/MemberNextActionsPanel'
import MemberPriorityMetrics, {
  type MemberPriorityMetricItem,
  type MemberPriorityMetricTone,
} from '@/components/MemberPriorityMetrics'
import BadgeGrid from '@/components/BadgeGrid'
import MyCraftPickupsSection from '@/components/MyCraftPickupsSection'
import ActivityRecordVisibilityControl from '@/components/ActivityRecordVisibilityControl'
import { buildPublicActivityUrl } from '@/lib/member-activity-public-url'
import { PageHeader } from '@/components/ui-patterns'
import { buildLoginEntryHref, buildReturnToWithSearchParams } from '@/lib/login-entry'
import { loadMemberAchievements } from '@/lib/member-achievements'
import { getRegearSupportConfiguration } from '@/lib/regear-support-server'
import { loadMemberWorkInboxSnapshot } from '@/lib/member-work-inbox-server'
import { isGuildFeatureDiscoverable } from '@/lib/guild-features'
import { loadGuildFeatureSnapshot } from '@/lib/guild-features-server'
import { resolveStableMemberOwnership } from '@/lib/stable-member-ownership'

export const dynamic = 'force-dynamic'

const PARTICIPATION_PREVIEW_LIMIT = 20

interface PrivateGuildActivityRecord {
  guildId: string
  guildName: string
  isCurrent: boolean
  relation: string
  trustStatus: string
  eventCount: number
  pointBalance: number
  requestCount: number
  publicActivityEnabled: boolean
  publicLeaderboardEnabled: boolean
  publicActivityUrl: string
}

interface PrivateGuildActivitySummary {
  guildId: string
  eventIds: Set<string>
  requestCount: number
}

export default async function MePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const [session, sp] = await Promise.all([getSession(), searchParams])
  if (!session) {
    const returnParams = new URLSearchParams()
    if (sp.view) returnParams.set('view', sp.view)
    redirect(buildLoginEntryHref({
      returnTo: buildReturnToWithSearchParams('/me', returnParams),
    }))
  }
  // Guests have no points/regear/exchange — skip the financial dashboard.
  if (!session.isMember) {
    redirect('/')
  }
  const showDetails = sp.view === 'details'

  const guildId = await getSessionGuildId(session)
  const [regearSupport, featureSnapshot] = await Promise.all([
    getRegearSupportConfiguration(guildId),
    loadGuildFeatureSnapshot(guildId),
  ])
  const regearSupported = regearSupport.supported
  const economyVisible = isGuildFeatureDiscoverable(featureSnapshot.guild_economy.state)
  const marketVisible = isGuildFeatureDiscoverable(featureSnapshot.member_market.state)
  const siphonVisible = isGuildFeatureDiscoverable(featureSnapshot.asset_accounting.state)
  const insightsVisible = isGuildFeatureDiscoverable(featureSnapshot.insights.state)

  const [
    dashboard,
    achievements,
    memberTradePoints,
    { requests: exchanges },
    { entries: participation },
    siphonAccount,
    albionIdentity,
    accountAlbionIdentity,
    tenantConfig,
    eligibleRegears,
    memberWorkInbox,
    weeklyStatsEnabledRaw,
    allianceRegearEnabledRaw,
    uxRefreshEnabledRaw,
    t,
    tRequests,
    tOnboarding,
    tRole,
    tCommon,
    locale,
    tz,
  ] = await Promise.all([
    getMyDashboard(),
    loadMemberAchievements(getAdminClient(), guildId, session.discordId),
    economyVisible
      ? getMyMemberTradePointSummary()
      : Promise.resolve({ balance: 0, escrowed: 0, spendable: 0 }),
    economyVisible ? listMyExchangeRequests() : Promise.resolve({ requests: [] }),
    showDetails ? listMyParticipation() : Promise.resolve({ entries: [] }),
    siphonVisible
      ? getMySiphonAccount(5)
      : Promise.resolve({ status: 'error' as const, error: 'feature-disabled' }),
    getMemberAlbionIdentity(session.discordId, guildId),
    getAccountAlbionIdentityView(guildId, session.discordId),
    getTenantDiscordConfig(guildId),
    regearSupported
      ? listMyRegearEligibleEvents()
      : Promise.resolve({ events: [] }),
    loadMemberWorkInboxSnapshot(
      getAdminClient(),
      guildId,
      session.discordId,
      { includeHistory: false, historyLimit: 0 },
    ),
    // 길드별 토글 — 기본 OFF. SaaS 다른 테넌트에는 노출하지 않는다. 우리 길드는
    // 별도 SQL upsert 로 'true' 설정.
    getAppSetting('me_weekly_stats_enabled', 'false', guildId),
    getAppSetting('alliance_regear_enabled', 'false', guildId),
    getAppSetting('ux_refresh_v2_enabled', 'false', guildId),
    getTranslations('me'),
    getTranslations('myRequests'),
    getTranslations('albionOnboarding'),
    getTranslations('slotRole'),
    getTranslations('common'),
    getLocale(),
    getTenantTimezone(guildId),
  ])

  const weeklyStatsEnabled = weeklyStatsEnabledRaw === 'true'
  const allianceRegearEnabled = allianceRegearEnabledRaw === 'true'
  const uxRefreshEnabled = uxRefreshEnabledRaw === 'true'
  const visualRefreshEnabled = true

  const albionVerified = accountAlbionIdentity
    ? canUseGuildResourceFeatures({
        relation: accountAlbionIdentity.relation,
        trustStatus: accountAlbionIdentity.trustStatus,
        resourceAccessOverride: accountAlbionIdentity.resourceAccessOverride,
      })
    : isAlbionVerified(albionIdentity)
  const albionNeedsReview = accountAlbionIdentity
    ? accountAlbionIdentity.trustStatus === 'roster_matched' ||
      accountAlbionIdentity.trustStatus === 'disputed'
    : false
  const manualRegearAllowed = accountAlbionIdentity
    ? canUseManualRegearFeature({
        relation: accountAlbionIdentity.relation,
        trustStatus: accountAlbionIdentity.trustStatus,
        resourceAccessOverride: accountAlbionIdentity.resourceAccessOverride,
        allianceRegearEnabled,
      })
    : albionVerified
  const albionAccountSub = albionVerified
    ? t('accountAlbionTrusted')
    : manualRegearAllowed && accountAlbionIdentity?.relation === 'alliance'
      ? t('accountAlbionRegearOnly')
      : t('accountAlbionNeedsCheck')
  const albionDisplayName =
    accountAlbionIdentity?.nickname ?? albionIdentity?.nickname ?? null
  const albionDisplayServer =
    accountAlbionIdentity?.server ?? albionIdentity?.server ?? null
  const currentGuildName = tenantConfig?.slug
    ? displayNameFromSlug(tenantConfig.slug) || tenantConfig.name
    : (tenantConfig?.name ?? null)

  const escrowedPoints = memberTradePoints.escrowed
  const spendablePoints = memberTradePoints.spendable
  const pendingExchange = exchanges.find((e) => e.status === 'pending') ?? null
  const pendingTotal = memberWorkInbox.activeCount
  const participationPreview = participation.slice(
    0,
    PARTICIPATION_PREVIEW_LIMIT,
  )
  const hasMoreParticipation =
    participation.length > participationPreview.length
  const nextEventForAction = dashboard?.nextActionEvent
    ? {
        id: dashboard.nextActionEvent.id,
        title: dashboard.nextActionEvent.title,
        kind: dashboard.nextActionEvent.kind,
        subtitle: [
          dashboard.nextActionEvent.gather_at
            ? formatGatherTimeFor(
                locale,
                dashboard.nextActionEvent.gather_at,
                tz,
              )
            : dashboard.nextActionEvent.gather_time,
          dashboard.nextActionEvent.role_name
            ? translateSlotRole(dashboard.nextActionEvent.role_name, tRole)
            : null,
        ]
          .filter(Boolean)
          .join(' · '),
      }
    : null
  const regearActionItems = eligibleRegears.events.slice(0, 3).map((event) => ({
    id: event.id,
    title: event.title,
    roleName: translateSlotRole(event.role_name, tRole),
    reward: formatSilver(event.role_reward),
    deadline: formatDateTime(event.deadline_at, tz),
    href: '/regear',
  }))
  const siphonPriority = getSiphonPriority(siphonAccount, t)
  const priorityMetrics: MemberPriorityMetricItem[] = [
    ...(economyVisible ? [{
      href: '/me/wallet',
      icon: <Coins size={22} />,
      label: t('priorityPointsLabel'),
      value: formatSilver(spendablePoints),
      sub: pendingExchange
        ? t('priorityPointsPendingSub', {
            amount: formatSilver(pendingExchange.silver),
          })
        : escrowedPoints > 0
          ? t('priorityPointsEscrowedSub', {
              amount: formatSilver(escrowedPoints),
            })
          : t('priorityPointsReadySub'),
      tone: 'points' as const,
    }] : []),
    ...(siphonVisible ? [siphonPriority] : []),
  ]

  return (
    <main
      data-tour-id="member-tour-me"
      className="v3-member-workspace flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6"
    >
      <PageHeader title={t('title')} />

      {!regearSupported && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-100/80">
          {t('regearReadOnlyNotice')}
        </div>
      )}

      <MemberNextActionsPanel
        albionVerified={albionVerified}
        pendingTotal={pendingTotal}
        nextEvent={nextEventForAction}
        regearItems={regearActionItems}
        labels={{
          title: t('actionTitle'),
          verifyTitle: t('actionVerifyTitle'),
          verifyBody: t('actionVerifyBody'),
          requestsTitle: t('actionWorkInboxTitle'),
          requestsBody: t('actionWorkInboxBody', {
            action: memberWorkInbox.actionRequiredCount,
            waiting: memberWorkInbox.waitingOnGuildCount,
          }),
          nextEventTitle: t('actionNextEventTitle'),
          pendingEventTitle: t('actionPendingEventTitle'),
          tentativeEventTitle: t('actionTentativeEventTitle'),
          availableEventTitle: t('actionAvailableEventTitle'),
          regearTitle: t('actionRegearTitle'),
          regearBody: (item) =>
            t('actionRegearBody', {
              role: item.roleName,
              reward: item.reward,
              deadline: item.deadline,
            }),
          noItemsTitle: t('actionNoItemsTitle'),
          noItemsBody: t('actionNoItemsBody'),
          open: t('actionOpen'),
        }}
      />

      {priorityMetrics.length > 0 && (
        <MemberPriorityMetrics
          compact={uxRefreshEnabled}
          items={priorityMetrics}
        />
      )}

      <details
        open={!albionVerified}
        className="group rounded-2xl border border-gray-800 bg-gray-900/45"
      >
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none sm:px-5">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-white">
              {t('accountDisclosureTitle')}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
              {albionVerified
                ? t('accountDisclosureReady')
                : t('accountDisclosureAction')}
            </span>
          </span>
          <ChevronRight
            size={17}
            className="shrink-0 text-gray-500 transition-transform group-open:rotate-90"
          />
        </summary>
        <div className="space-y-3 border-t border-gray-800 p-3 sm:p-4">
          <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <UserCircle2 size={18} className="text-amber-300" />
                  {t('accountInfoTitle')}
                </h2>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
                <LockKeyhole size={11} />
                {t('privateOnlyBadge')}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <WalletMetric
                label={t('accountDiscordLabel')}
                value={session.username}
                valueClass="text-white"
              />
              <WalletMetric
                label={t('accountAlbionLabel')}
                value={
                  albionDisplayName
                    ? albionDisplayServer
                      ? `${albionDisplayName} · ${tCommon(ALBION_SERVER_LABEL_KEY[albionDisplayServer])}`
                      : albionDisplayName
                    : t('accountAlbionMissing')
                }
                valueClass={albionDisplayName ? 'text-white' : 'text-gray-500'}
                sub={albionAccountSub}
              />
              <WalletMetric
                label={t('accountCurrentGuildLabel')}
                value={currentGuildName ?? t('accountCurrentGuildUnknown')}
                valueClass="text-white"
                sub={t('accountCurrentGuildSub')}
              />
            </div>
          </section>

          <section
            className={`flex items-start gap-3 rounded-2xl border p-4 ${
              albionVerified
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                : albionNeedsReview
                  ? 'bg-sky-500/10 border-sky-500/30 text-sky-200'
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
                {albionVerified
                  ? tOnboarding('profileBadgeVerified')
                  : albionNeedsReview
                    ? tOnboarding('profileBadgeNeedsReview')
                    : tOnboarding('profileBadgeUnverified')}
                {albionDisplayName && (
                  <span className="ml-2 text-xs opacity-80 font-mono">
                    {albionDisplayName}
                    {albionDisplayServer && (
                      <span className="ml-1 opacity-70">
                        ·{' '}
                        {tCommon(ALBION_SERVER_LABEL_KEY[albionDisplayServer])}
                      </span>
                    )}
                  </span>
                )}
              </p>
              <p className="text-xs leading-relaxed opacity-80">
                {albionVerified
                  ? tOnboarding('profileNoteVerified')
                  : albionNeedsReview
                    ? tOnboarding('profileNoteNeedsReview')
                    : tOnboarding('profileNoteUnverified')}
              </p>
              {!albionVerified && (
                <Link
                  href={
                    albionNeedsReview
                      ? '/me/profile'
                      : '/onboarding/albion?return=%2Fme'
                  }
                  className="inline-block mt-1 text-xs underline underline-offset-2 font-semibold hover:opacity-80"
                >
                  {albionNeedsReview
                    ? tOnboarding('profileCtaProfile')
                    : tOnboarding('profileCtaVerify')}
                </Link>
              )}
            </div>
          </section>
        </div>
      </details>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <QuickLinkCard
          href="/events"
          icon={<CalendarDays size={16} />}
          title={t('quickEventsTitle')}
          body={t('quickEventsBody')}
        />
        {economyVisible && (
          <QuickLinkCard
            href="/me/wallet"
            icon={<Coins size={16} />}
            title={t('quickWalletTitle')}
            body={t('quickWalletBody')}
          />
        )}
        {marketVisible && (
          <QuickLinkCard
            href="/market"
            icon={<Store size={16} />}
            title={t('quickMarketTitle')}
            body={t('quickMarketBody')}
          />
        )}
        {siphonVisible && (
          <QuickLinkCard
            href="/me/siphon"
            icon={<Zap size={16} />}
            title={t('quickSiphonTitle')}
            body={t('quickSiphonBody')}
          />
        )}
        <QuickLinkCard
          href="/regear"
          icon={<Swords size={16} />}
          title={regearSupported ? t('quickRegearTitle') : t('regearViewClaim')}
          body={regearSupported ? t('quickRegearBody') : t('regearReadOnlyNotice')}
        />
        {insightsVisible && (
          <QuickLinkCard
            href="/leaderboard"
            icon={<Trophy size={16} />}
            title={t('quickLeaderboardTitle')}
            body={t('quickLeaderboardBody')}
          />
        )}
      </section>

      {showDetails ? (
        <section className="rounded-2xl border border-gray-800 bg-gray-900/45">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">
                {t('historyDisclosureTitle')}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
                {t('historyDisclosureDescription')}
              </span>
            </span>
            <Link
              href="/me"
              className="shrink-0 rounded-lg border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 transition-colors hover:border-amber-500/45 hover:text-white"
            >
              {t('historyDisclosureClose')}
            </Link>
          </div>
          <div className="space-y-6 border-t border-gray-800 p-3 sm:p-4">
            {dashboard && (
              <MyHomeDashboardCard
                data={dashboard}
                weeklyStatsEnabled={weeklyStatsEnabled}
                timezone={tz}
                visualRefreshEnabled={visualRefreshEnabled}
              />
            )}

            <Suspense fallback={null}>
              <MyCraftPickupsSection />
            </Suspense>

            {siphonVisible && (
              <MySiphonSummarySection result={siphonAccount} t={t} tz={tz} />
            )}

            <BadgeGrid achievements={achievements} />

            <Suspense fallback={null}>
              <PrivateGuildActivityRecordsSection
                discordId={session.discordId}
                currentGuildId={guildId}
              />
            </Suspense>

            <Link
              href="/me/requests"
              className="flex items-center justify-between gap-3 bg-gray-900 border border-gray-700 hover:border-amber-500/40 rounded-2xl px-4 py-3 transition-colors group"
            >
              <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-semibold">
                  {tRequests('cardTitle')}
                </p>
                <p className="text-gray-500 text-xs mt-0.5">
                  {pendingTotal > 0
                    ? tRequests('cardSubtitlePending', { count: pendingTotal })
                    : tRequests('cardSubtitle')}
                </p>
              </div>
              <ChevronRight
                size={18}
                className="text-gray-500 group-hover:text-amber-400 flex-shrink-0"
              />
            </Link>

            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {t('participationTitle')}
                  </h2>
                  {participation.length > 0 && (
                    <p className="mt-0.5 text-xs text-gray-500">
                      {hasMoreParticipation
                        ? t('participationPreviewHint', {
                            shown: participationPreview.length,
                            total: participation.length,
                          })
                        : t('participationCount', {
                            count: participation.length,
                          })}
                    </p>
                  )}
                </div>
                <Link
                  href={`/me/activity/${guildId}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200"
                >
                  {t('participationDetailLink')}
                  <ChevronRight size={13} />
                </Link>
              </div>
              {participation.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-6">
                  {t('noParticipation')}
                </p>
              ) : (
                <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
                  {participationPreview.map((p) => (
                    <li
                      key={p.event_id}
                      className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3"
                    >
                      <Link
                        href={`/events/${p.event_id}`}
                        className="flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-white text-sm font-medium truncate">
                            {p.event_title}
                          </p>
                          <p className="text-gray-500 text-xs">
                            {p.gather_at
                              ? formatGatherTimeFor(locale, p.gather_at, tz)
                              : p.gather_time}
                            {p.role_name && (
                              <span className="ml-2 text-gray-400">
                                · {translateSlotRole(p.role_name, tRole)}
                              </span>
                            )}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </section>
      ) : (
        <Link
          href="/me?view=details"
          className="group flex min-h-20 items-center justify-between gap-3 rounded-2xl border border-gray-800 bg-gray-900/45 px-4 py-3 transition-colors hover:border-amber-500/45 hover:bg-gray-900 sm:px-5"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-800 text-amber-300">
              <History size={17} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-white">
                {t('historyDisclosureTitle')}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-gray-500">
                {t('historyDisclosureDescription')}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-gray-500 group-hover:text-amber-300">
            {t('historyDisclosureOpen')}
            <ChevronRight size={15} />
          </span>
        </Link>
      )}
    </main>
  )
}

async function loadPrivateGuildActivityRecords(
  discordId: string,
  currentGuildId: string,
): Promise<PrivateGuildActivityRecord[]> {
  const db = getAdminClient()
  const { data: links, error: linksError } = await db
    .from('account_albion_tenant_links')
    .select(
      'guild_id, relation, trust_status, public_activity_enabled, public_leaderboard_enabled, public_activity_token',
    )
    .eq('discord_id', discordId)
    .is('revoked_at', null)

  if (linksError || !links || links.length === 0) return []

  const guildIds = Array.from(
    new Set(links.map((row) => row.guild_id as string).filter(Boolean)),
  )
  if (guildIds.length === 0) return []

  const [tenantsRes, pointBalances, activitySummaries] = await Promise.all([
    db.from('tenants').select('id, slug, name').in('id', guildIds),
    getPointBalancesByGuildForMember(db, guildIds, discordId),
    Promise.all(
      guildIds.map((guildId) => loadPrivateGuildActivitySummary(db, guildId, discordId)),
    ),
  ])

  const tenantNames = new Map<string, string>()
  for (const row of tenantsRes.data ?? []) {
    const id = row.id as string
    const slug = (row.slug as string | null) ?? ''
    const name = (row.name as string | null) ?? ''
    tenantNames.set(id, displayNameFromSlug(slug) || name || id)
  }

  const balances = pointBalances.error
    ? new Map<string, number>()
    : pointBalances.balances

  const requestCounts = new Map(
    activitySummaries.map((summary) => [summary.guildId, summary.requestCount]),
  )
  const eventIdsByGuild = new Map(
    activitySummaries.map((summary) => [summary.guildId, summary.eventIds]),
  )

  return links
    .map((row) => {
      const guildId = row.guild_id as string
      return {
        guildId,
        guildName: tenantNames.get(guildId) ?? guildId,
        isCurrent: guildId === currentGuildId,
        relation: normalizeActivityKey(row.relation, [
          'home_guild',
          'alliance',
          'external',
          'unknown',
        ]),
        trustStatus: normalizeActivityKey(row.trust_status, [
          'claimed',
          'roster_matched',
          'trusted',
          'disputed',
          'revoked',
        ]),
        eventCount: eventIdsByGuild.get(guildId)?.size ?? 0,
        pointBalance: balances.get(guildId) ?? 0,
        requestCount: requestCounts.get(guildId) ?? 0,
        publicActivityEnabled: Boolean(row.public_activity_enabled),
        publicLeaderboardEnabled: Boolean(row.public_leaderboard_enabled),
        publicActivityUrl: buildPublicActivityUrl(
          String(row.public_activity_token ?? ''),
        ),
      }
    })
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
      return a.guildName.localeCompare(b.guildName)
    })
}

async function loadPrivateGuildActivitySummary(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
  discordId: string,
): Promise<PrivateGuildActivitySummary> {
  const ownership = await resolveStableMemberOwnership(db, guildId, discordId)
  const ownerColumn = ownership.guildMemberId ? 'guild_member_id' : 'discord_id'
  const ownerValue = ownership.guildMemberId ?? discordId
  let slotsQuery = db
    .from('slots')
    .select('parties!inner(events!inner(id))')
    .eq('guild_id', guildId)
  slotsQuery = ownership.guildMemberId
    ? slotsQuery.or(
        `assigned_guild_member_id.eq.${ownership.guildMemberId},requested_guild_member_id.eq.${ownership.guildMemberId}`,
      )
    : slotsQuery.or(
        `assigned_discord_id.eq.${discordId},requested_discord_id.eq.${discordId}`,
      )
  const tentativeQuery = db
    .from('event_tentative_signups')
    .select('event_id, events!inner(status, battle_started_at, tentative_snapshot_version_id)')
    .eq('guild_id', guildId)
    .eq(ownerColumn, ownerValue)
    .eq('events.status', 'published')
    .is('events.battle_started_at', null)
    .is('events.tentative_snapshot_version_id', null)
  const [regearRes, exchangeRes, donationRes, slotsRes, tentativeRes] = await Promise.all([
    db
      .from('regear_requests')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq(ownerColumn, ownerValue),
    db
      .from('exchange_requests')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq(ownerColumn, ownerValue),
    db
      .from('donation_requests')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq(ownerColumn, ownerValue),
    slotsQuery,
    tentativeQuery,
  ])

  const eventIds = new Set<string>()
  for (const row of slotsRes.data ?? []) {
    const party = Array.isArray(row.parties) ? row.parties[0] : row.parties
    const event = Array.isArray(party?.events) ? party.events[0] : party?.events
    if (event?.id) eventIds.add(event.id as string)
  }
  for (const row of tentativeRes.data ?? []) {
    if (row.event_id) eventIds.add(row.event_id as string)
  }

  return {
    guildId,
    eventIds,
    requestCount:
      (regearRes.count ?? 0) +
      (exchangeRes.count ?? 0) +
      (donationRes.count ?? 0),
  }
}

function normalizeActivityKey(
  value: unknown,
  allowed: readonly string[],
): string {
  return typeof value === 'string' && allowed.includes(value)
    ? value
    : 'unknown'
}

async function PrivateGuildActivityRecordsSection({
  discordId,
  currentGuildId,
}: {
  discordId: string
  currentGuildId: string
}) {
  const [activityRecords, t] = await Promise.all([
    loadPrivateGuildActivityRecords(discordId, currentGuildId),
    getTranslations('me'),
  ])
  if (activityRecords.length === 0) return null

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <History size={18} className="text-amber-300" />
            {t('activityRecordTitle')}
          </h2>
          <p className="text-gray-400 text-xs leading-relaxed mt-1">
            {t('activityRecordDescription')}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-950/50 px-2.5 py-1 text-[11px] font-semibold text-gray-300">
          <LockKeyhole size={11} />
          {t('activityRecordPrivateHint')}
        </span>
      </div>
      <div className="space-y-2">
        {activityRecords.map((record) => (
          <div
            key={record.guildId}
            className="rounded-xl border border-gray-800 bg-gray-950/40 px-3 py-3 sm:px-4"
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(260px,1fr)] sm:items-center">
              <div className="min-w-0 space-y-2">
                <p className="text-sm font-bold text-white truncate">
                  {record.guildName}
                  {record.isCurrent && (
                    <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                      {t('activityRecordCurrentBadge')}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {t(`activityRecordRelation_${record.relation}`)}
                  <span className="mx-1 text-gray-700">·</span>
                  {t(`activityRecordTrust_${record.trustStatus}`)}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <CompactRecordMetric
                    label={t('activityRecordEvents')}
                    value={t('activityRecordCount', {
                      count: record.eventCount,
                    })}
                  />
                  <CompactRecordMetric
                    label={t('activityRecordPoints')}
                    value={formatSilver(record.pointBalance)}
                  />
                  <CompactRecordMetric
                    label={t('activityRecordRequests')}
                    value={t('activityRecordCount', {
                      count: record.requestCount,
                    })}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <div className="flex items-center gap-2">
                  <Link
                    href={`/me/activity/${record.guildId}`}
                    className="inline-flex items-center gap-1 rounded-full border border-gray-700 bg-gray-950/60 px-2.5 py-1 text-[11px] font-semibold text-amber-300 hover:border-amber-500/40 hover:text-amber-200"
                  >
                    {t('activityRecordDetailLink')}
                    <ChevronRight size={13} />
                  </Link>
                </div>
                <ActivityRecordVisibilityControl
                  guildId={record.guildId}
                  initialEnabled={record.publicActivityEnabled}
                  initialLeaderboardEnabled={record.publicLeaderboardEnabled}
                  publicUrl={record.publicActivityUrl}
                  labels={{
                    publicBadge: t('activityRecordPublicBadge'),
                    privateBadge: t('activityRecordPrivateBadge'),
                    enable: t('activityRecordEnablePublic'),
                    disable: t('activityRecordDisablePublic'),
                    copy: t('activityRecordCopyPublicLink'),
                    copied: t('activityRecordCopiedPublicLink'),
                    confirmEnable: t('activityRecordPublicConfirm'),
                    leaderboardLabel: t('activityRecordLeaderboardLabel'),
                    leaderboardPublic: t('activityRecordLeaderboardPublic'),
                    leaderboardPrivate: t('activityRecordLeaderboardPrivate'),
                    leaderboardEnable: t('activityRecordEnableLeaderboard'),
                    leaderboardDisable: t('activityRecordDisableLeaderboard'),
                    leaderboardConfirmEnable: t('activityRecordLeaderboardConfirm'),
                    error: t('activityRecordVisibilityError'),
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function getSiphonPriority(
  result: MySiphonAccountResult,
  t: Awaited<ReturnType<typeof getTranslations<'me'>>>,
): MemberPriorityMetricItem {
  if (result.status === 'unverified') {
    return {
      href: '/onboarding/albion?return=%2Fme',
      icon: <Zap size={22} />,
      label: t('prioritySiphonLabel'),
      value: t('prioritySiphonUnverifiedValue'),
      sub: t('prioritySiphonUnverifiedSub'),
      tone: 'warning',
    }
  }
  if (result.status === 'error') {
    return {
      href: '#siphon',
      icon: <Zap size={22} />,
      label: t('prioritySiphonLabel'),
      value: '-',
      sub: t('prioritySiphonErrorSub'),
      tone: 'neutral',
    }
  }

  if (result.accountingMode === 'record') {
    return {
      href: '#siphon',
      icon: <Zap size={22} />,
      label: t('prioritySiphonActivityLabel'),
      value: formatSiphonUnsignedCount(
        result.account.deposited + result.account.withdrawn,
        t,
      ),
      sub: t('siphonRecordSub'),
      tone: 'neutral',
    }
  }

  const tone: MemberPriorityMetricTone =
    result.account.net < 0
      ? 'negative'
      : result.account.net > 0
        ? 'positive'
        : 'neutral'
  const sub =
    result.account.net < 0
      ? t('siphonNegativeSub')
      : result.account.net > 0
        ? t('siphonPositiveSub')
        : t('siphonZeroSub')

  return {
    href: '#siphon',
    icon: <Zap size={22} />,
    label: t('prioritySiphonLabel'),
    value: formatSiphonCount(result.account.net, t),
    sub,
    tone,
  }
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
      <p className="mt-1 text-xs text-gray-500 leading-relaxed line-clamp-2">
        {body}
      </p>
    </Link>
  )
}

function WalletMetric({
  label,
  value,
  sub,
  accent = false,
  valueClass,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
  valueClass?: string
}) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-bold font-mono ${valueClass ?? (accent ? 'text-amber-300' : 'text-white')}`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-gray-500">{sub}</p>}
    </div>
  )
}

function CompactRecordMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/70 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-white font-mono">{value}</p>
    </div>
  )
}

function MySiphonSummarySection({
  result,
  t,
  tz,
}: {
  result: MySiphonAccountResult
  t: Awaited<ReturnType<typeof getTranslations<'me'>>>
  tz: string
}) {
  const account = result.status === 'ready' ? result.account : null
  const recordMode = result.status === 'ready' && result.accountingMode === 'record'
  const balanceClass = !account
    ? 'text-white'
    : recordMode
      ? 'text-sky-300'
    : account.net < 0
      ? 'text-rose-300'
      : account.net > 0
        ? 'text-emerald-300'
        : 'text-white'
  const balanceSub = !account
    ? undefined
    : recordMode
      ? t('siphonRecordSub')
    : account.net < 0
      ? t('siphonNegativeSub')
      : account.net > 0
        ? t('siphonPositiveSub')
        : t('siphonZeroSub')

  return (
    <section
      id="siphon"
      className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4 scroll-mt-20"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Zap size={18} className="text-amber-300" />
            {t('siphonTitle')}
          </h2>
          <p className="text-gray-400 text-xs leading-relaxed mt-1">
            {recordMode ? t('siphonRecordDescription') : t('siphonDescription')}
          </p>
        </div>
        <Link
          href="/me/siphon"
          className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200"
        >
          <ListChecks size={14} />
          {t('siphonHistoryLink')}
        </Link>
      </div>

      {result.status === 'unverified' ? (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
          <p className="font-semibold">{t('siphonUnverifiedTitle')}</p>
          <p className="mt-1 text-xs leading-relaxed text-yellow-100/80">
            {t('siphonUnverifiedBody')}
          </p>
          <Link
            href="/onboarding/albion?return=%2Fme"
            className="inline-block mt-2 text-xs font-semibold underline underline-offset-2 hover:opacity-80"
          >
            {t('siphonVerifyCta')}
          </Link>
        </div>
      ) : result.status === 'error' ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <p className="font-semibold">{t('siphonErrorTitle')}</p>
          <p className="mt-1 text-xs leading-relaxed text-rose-100/80">
            {t('siphonErrorBody')}
          </p>
        </div>
      ) : (
        <>
          <p className="text-[11px] text-gray-500">
            {t('siphonVerifiedPlayer', { player: result.account.player })}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <WalletMetric
              label={recordMode ? t('siphonActivityTotalLabel') : t('siphonBalanceLabel')}
              value={recordMode
                ? formatSiphonUnsignedCount(
                    result.account.deposited + result.account.withdrawn,
                    t,
                  )
                : formatSiphonCount(result.account.net, t)}
              valueClass={balanceClass}
              sub={balanceSub}
            />
            <WalletMetric
              label={t('siphonDepositedLabel')}
              value={formatSiphonCount(result.account.deposited, t)}
              valueClass="text-emerald-300"
            />
            <WalletMetric
              label={t('siphonWithdrawnLabel')}
              value={formatSiphonCount(result.account.withdrawn, t)}
              valueClass="text-rose-300"
            />
            <WalletMetric
              label={t('siphonLastActivityLabel')}
              value={
                result.account.lastActivityAt
                  ? formatDateTime(result.account.lastActivityAt, tz)
                  : t('siphonNoActivity')
              }
            />
          </div>
        </>
      )}
    </section>
  )
}

function formatSiphonCount(
  n: number,
  t: Awaited<ReturnType<typeof getTranslations<'me'>>>,
): string {
  const sign = n > 0 ? '+' : n < 0 ? '-' : ''
  return t('siphonUnit', {
    count: `${sign}${Math.abs(n).toLocaleString('en-US')}`,
  })
}

function formatSiphonUnsignedCount(
  n: number,
  t: Awaited<ReturnType<typeof getTranslations<'me'>>>,
): string {
  return t('siphonUnit', { count: Math.max(0, n).toLocaleString('en-US') })
}
