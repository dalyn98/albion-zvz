import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowRightLeft,
  CalendarDays,
  ChevronRight,
  Coins,
  History,
  ListChecks,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  Swords,
  Trophy,
  UserCircle2,
  Zap,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { listMyExchangeRequests } from '@/app/actions/exchange'
import { listMyParticipation } from '@/app/actions/member'
import { listTransferCandidates } from '@/app/actions/transfer'
import { getMyDashboard } from '@/app/actions/me-dashboard'
import { listMyRegearEligibleEvents } from '@/app/actions/regear'
import { getMySiphonAccount, type MySiphonAccountResult } from '@/app/actions/siphon-member'
import { getMemberAlbionIdentity, isAlbionVerified } from '@/lib/albion-identity'
import {
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
import RequestExchangeForm from '@/components/RequestExchangeForm'
import TransferPointsForm from '@/components/TransferPointsForm'
import DonationRequestButton from '@/components/DonationRequestButton'
import MyCraftPickupsSection from '@/components/MyCraftPickupsSection'
import ActivityRecordVisibilityControl from '@/components/ActivityRecordVisibilityControl'
import { buildPublicActivityUrl } from '@/lib/member-activity-public-url'

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
  publicActivityUrl: string
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

  const guildId = await getSessionGuildId(session)

  const [
    dashboard,
    { requests: exchanges },
    { entries: participation },
    { candidates: transferCandidates },
    siphonAccount,
    albionIdentity,
    accountAlbionIdentity,
    tenantConfig,
    activityRecords,
    eligibleRegears,
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
    getMySiphonAccount(5),
    getMemberAlbionIdentity(session.discordId, guildId),
    getAccountAlbionIdentityView(guildId, session.discordId),
    getTenantDiscordConfig(guildId),
    loadPrivateGuildActivityRecords(session.discordId, guildId),
    listMyRegearEligibleEvents(),
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

  const albionVerified = accountAlbionIdentity
    ? canUseGuildResourceFeatures({
        relation: accountAlbionIdentity.relation,
        trustStatus: accountAlbionIdentity.trustStatus,
      })
    : isAlbionVerified(albionIdentity)
  const albionNeedsReview = accountAlbionIdentity
    ? accountAlbionIdentity.trustStatus === 'roster_matched' ||
      accountAlbionIdentity.trustStatus === 'disputed'
    : false
  const albionDisplayName = accountAlbionIdentity?.nickname ?? albionIdentity?.nickname ?? null
  const albionDisplayServer = accountAlbionIdentity?.server ?? albionIdentity?.server ?? null
  const currentGuildName =
    tenantConfig?.slug
      ? displayNameFromSlug(tenantConfig.slug) || tenantConfig.name
      : tenantConfig?.name ?? null

  const balance = dashboard?.balance ?? 0
  const pendingExchange = exchanges.find((e) => e.status === 'pending') ?? null
  const hasPendingExchange = !!pendingExchange
  const pendingTotal =
    (dashboard?.pendingRegearCount ?? 0) +
    (dashboard?.pendingExchangeCount ?? 0) +
    (dashboard?.pendingDonationCount ?? 0)
  const participationPreview = participation.slice(0, PARTICIPATION_PREVIEW_LIMIT)
  const hasMoreParticipation = participation.length > participationPreview.length
  const nextEventForAction = dashboard?.nextActionEvent
    ? {
        id: dashboard.nextActionEvent.id,
        title: dashboard.nextActionEvent.title,
        kind: dashboard.nextActionEvent.kind,
        subtitle: [
          dashboard.nextActionEvent.gather_at
            ? formatGatherTimeFor(locale, dashboard.nextActionEvent.gather_at, tz)
            : dashboard.nextActionEvent.gather_time,
          dashboard.nextActionEvent.role_name
            ? translateSlotRole(dashboard.nextActionEvent.role_name, tRole)
            : null,
        ].filter(Boolean).join(' · '),
      }
    : null
  const regearActionItems = eligibleRegears.events.slice(0, 3).map((event) => ({
    id: event.auto_request_id ?? event.id,
    title: event.title,
    roleName: translateSlotRole(event.role_name, tRole),
    reward: formatSilver(event.role_reward),
    deadline: formatDateTime(event.deadline_at),
    href: event.auto_request_id ? `/me/regear/${event.auto_request_id}` : '/regear',
  }))
  const siphonPriority = getSiphonPriority(siphonAccount, t)

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">{t('title')}</h1>
        <p className="text-gray-400 text-sm">{t('description')}</p>
      </div>

      <MemberPriorityMetrics
        tourId="member-tour-me"
        items={[
          {
            href: '#wallet',
            icon: <Coins size={22} />,
            label: t('priorityPointsLabel'),
            value: formatSilver(balance),
            sub: pendingExchange
              ? t('priorityPointsPendingSub', { amount: formatSilver(pendingExchange.silver) })
              : t('priorityPointsReadySub'),
            tone: 'points',
          },
          siphonPriority,
        ]}
      />

      <MemberNextActionsPanel
        albionVerified={albionVerified}
        pendingTotal={pendingTotal}
        nextEvent={nextEventForAction}
        regearItems={regearActionItems}
        labels={{
          title: t('actionTitle'),
          description: t('actionDescription'),
          verifyTitle: t('actionVerifyTitle'),
          verifyBody: t('actionVerifyBody'),
          requestsTitle: t('actionRequestsTitle'),
          requestsBody: t('actionRequestsBody', { count: pendingTotal }),
          nextEventTitle: t('actionNextEventTitle'),
          pendingEventTitle: t('actionPendingEventTitle'),
          tentativeEventTitle: t('actionTentativeEventTitle'),
          availableEventTitle: t('actionAvailableEventTitle'),
          regearTitle: t('actionRegearTitle'),
          regearBody: (item) => t('actionRegearBody', {
            role: item.roleName,
            reward: item.reward,
            deadline: item.deadline,
          }),
          noItemsTitle: t('actionNoItemsTitle'),
          noItemsBody: t('actionNoItemsBody'),
          open: t('actionOpen'),
        }}
      />

      <section
        className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <UserCircle2 size={18} className="text-amber-300" />
              {t('accountInfoTitle')}
            </h2>
            <p className="text-gray-400 text-xs leading-relaxed mt-1">{t('accountInfoDescription')}</p>
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
            sub={albionVerified ? t('accountAlbionTrusted') : t('accountAlbionNeedsCheck')}
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
                  <span className="ml-1 opacity-70">· {tCommon(ALBION_SERVER_LABEL_KEY[albionDisplayServer])}</span>
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
              href={albionNeedsReview ? '/me/profile' : '/onboarding/albion?return=%2Fme'}
              className="inline-block mt-1 text-xs underline underline-offset-2 font-semibold hover:opacity-80"
            >
              {albionNeedsReview ? tOnboarding('profileCtaProfile') : tOnboarding('profileCtaVerify')}
            </Link>
          )}
        </div>
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
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
          href="#siphon"
          icon={<Zap size={16} />}
          title={t('quickSiphonTitle')}
          body={t('quickSiphonBody')}
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

      <MySiphonSummarySection result={siphonAccount} t={t} tz={tz} />

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

      {activityRecords.length > 0 && (
        <section className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <History size={18} className="text-amber-300" />
                {t('activityRecordTitle')}
              </h2>
              <p className="text-gray-400 text-xs leading-relaxed mt-1">{t('activityRecordDescription')}</p>
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
                        value={t('activityRecordCount', { count: record.eventCount })}
                      />
                      <CompactRecordMetric
                        label={t('activityRecordPoints')}
                        value={formatSilver(record.pointBalance)}
                      />
                      <CompactRecordMetric
                        label={t('activityRecordRequests')}
                        value={t('activityRecordCount', { count: record.requestCount })}
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
                      publicUrl={record.publicActivityUrl}
                      labels={{
                        publicBadge: t('activityRecordPublicBadge'),
                        privateBadge: t('activityRecordPrivateBadge'),
                        enable: t('activityRecordEnablePublic'),
                        disable: t('activityRecordDisablePublic'),
                        copy: t('activityRecordCopyPublicLink'),
                        copied: t('activityRecordCopiedPublicLink'),
                        confirmEnable: t('activityRecordPublicConfirm'),
                        error: t('activityRecordVisibilityError'),
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
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

      <section
        id="wallet"
        data-tour-id="member-tour-exchange"
        className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4 scroll-mt-20"
      >
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
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <ArrowRightLeft size={16} className="text-amber-300" />
                  {t('walletExchangeCtaTitle')}
                </h3>
                <p className="text-gray-300 text-xs leading-relaxed mt-1">
                  {pendingExchange
                    ? t('walletExchangeCtaPendingBody')
                    : t('walletExchangeCtaReadyBody')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-200/80">
                  {pendingExchange ? t('walletExchangeCtaPendingAmount') : t('walletExchangeCtaBalance')}
                </p>
                <p className="text-lg font-black text-amber-100 font-mono">
                  {formatSilver(pendingExchange?.silver ?? balance)}
                </p>
              </div>
            </div>
            <RequestExchangeForm balance={balance} disabled={hasPendingExchange} />
          </div>
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
          <div>
            <h2 className="text-lg font-bold text-white">{t('participationTitle')}</h2>
            {participation.length > 0 && (
              <p className="mt-0.5 text-xs text-gray-500">
                {hasMoreParticipation
                  ? t('participationPreviewHint', {
                      shown: participationPreview.length,
                      total: participation.length,
                    })
                  : t('participationCount', { count: participation.length })}
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
          <p className="text-gray-500 text-sm text-center py-6">{t('noParticipation')}</p>
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {participationPreview.map((p) => (
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

async function loadPrivateGuildActivityRecords(
  discordId: string,
  currentGuildId: string,
): Promise<PrivateGuildActivityRecord[]> {
  const db = getAdminClient()
  const { data: links, error: linksError } = await db
    .from('account_albion_tenant_links')
    .select('guild_id, relation, trust_status, public_activity_enabled, public_activity_token')
    .eq('discord_id', discordId)
    .is('revoked_at', null)

  if (linksError || !links || links.length === 0) return []

  const guildIds = Array.from(new Set(links.map((row) => row.guild_id as string).filter(Boolean)))
  if (guildIds.length === 0) return []

  const [
    tenantsRes,
    pointBalances,
    regearRes,
    exchangeRes,
    donationRes,
    slotsRes,
    tentativeRes,
  ] = await Promise.all([
    db.from('tenants').select('id, slug, name').in('id', guildIds),
    getPointBalancesByGuildForMember(db, guildIds, discordId),
    db.from('regear_requests').select('guild_id, id').in('guild_id', guildIds).eq('discord_id', discordId),
    db.from('exchange_requests').select('guild_id, id').in('guild_id', guildIds).eq('discord_id', discordId),
    db.from('donation_requests').select('guild_id, id').in('guild_id', guildIds).eq('discord_id', discordId),
    db
      .from('slots')
      .select('guild_id, parties!inner(events!inner(id))')
      .in('guild_id', guildIds)
      .or(`assigned_discord_id.eq.${discordId},requested_discord_id.eq.${discordId}`),
    db
      .from('event_tentative_signups')
      .select('guild_id, event_id')
      .in('guild_id', guildIds)
      .eq('discord_id', discordId),
  ])

  const tenantNames = new Map<string, string>()
  for (const row of tenantsRes.data ?? []) {
    const id = row.id as string
    const slug = (row.slug as string | null) ?? ''
    const name = (row.name as string | null) ?? ''
    tenantNames.set(id, displayNameFromSlug(slug) || name || id)
  }

  const balances = pointBalances.error ? new Map<string, number>() : pointBalances.balances

  const requestCounts = new Map<string, number>()
  for (const rows of [regearRes.data ?? [], exchangeRes.data ?? [], donationRes.data ?? []]) {
    for (const row of rows) {
      const guildId = row.guild_id as string
      requestCounts.set(guildId, (requestCounts.get(guildId) ?? 0) + 1)
    }
  }

  const eventIdsByGuild = new Map<string, Set<string>>()
  for (const row of slotsRes.data ?? []) {
    const guildId = row.guild_id as string
    const party = Array.isArray(row.parties) ? row.parties[0] : row.parties
    const event = Array.isArray(party?.events) ? party?.events[0] : party?.events
    const eventId = event?.id as string | undefined
    if (!eventId) continue
    const set = eventIdsByGuild.get(guildId) ?? new Set<string>()
    set.add(eventId)
    eventIdsByGuild.set(guildId, set)
  }
  for (const row of tentativeRes.data ?? []) {
    const guildId = row.guild_id as string
    const eventId = row.event_id as string | null
    if (!eventId) continue
    const set = eventIdsByGuild.get(guildId) ?? new Set<string>()
    set.add(eventId)
    eventIdsByGuild.set(guildId, set)
  }

  return links
    .map((row) => {
      const guildId = row.guild_id as string
      return {
        guildId,
        guildName: tenantNames.get(guildId) ?? guildId,
        isCurrent: guildId === currentGuildId,
        relation: normalizeActivityKey(row.relation, ['home_guild', 'alliance', 'external', 'unknown']),
        trustStatus: normalizeActivityKey(row.trust_status, ['claimed', 'roster_matched', 'trusted', 'disputed', 'revoked']),
        eventCount: eventIdsByGuild.get(guildId)?.size ?? 0,
        pointBalance: balances.get(guildId) ?? 0,
        requestCount: requestCounts.get(guildId) ?? 0,
        publicActivityEnabled: Boolean(row.public_activity_enabled),
        publicActivityUrl: buildPublicActivityUrl(String(row.public_activity_token ?? '')),
      }
    })
    .sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1
      return a.guildName.localeCompare(b.guildName)
    })
}

function normalizeActivityKey(value: unknown, allowed: readonly string[]): string {
  return typeof value === 'string' && allowed.includes(value) ? value : 'unknown'
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

  const tone: MemberPriorityMetricTone =
    result.account.net < 0 ? 'negative' : result.account.net > 0 ? 'positive' : 'neutral'
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
      <p className="mt-1 text-xs text-gray-500 leading-relaxed line-clamp-2">{body}</p>
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
      <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold font-mono ${valueClass ?? (accent ? 'text-amber-300' : 'text-white')}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-[11px] text-gray-500">{sub}</p>}
    </div>
  )
}

function CompactRecordMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/70 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">{label}</p>
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
  const balanceClass = !account
    ? 'text-white'
    : account.net < 0
      ? 'text-rose-300'
      : account.net > 0
        ? 'text-emerald-300'
        : 'text-white'
  const balanceSub = !account
    ? undefined
    : account.net < 0
      ? t('siphonNegativeSub')
      : account.net > 0
        ? t('siphonPositiveSub')
        : t('siphonZeroSub')

  return (
    <section id="siphon" className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-4 scroll-mt-20">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Zap size={18} className="text-amber-300" />
            {t('siphonTitle')}
          </h2>
          <p className="text-gray-400 text-xs leading-relaxed mt-1">{t('siphonDescription')}</p>
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
          <p className="mt-1 text-xs leading-relaxed text-yellow-100/80">{t('siphonUnverifiedBody')}</p>
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
          <p className="mt-1 text-xs leading-relaxed text-rose-100/80">{t('siphonErrorBody')}</p>
        </div>
      ) : (
        <>
          <p className="text-[11px] text-gray-500">
            {t('siphonVerifiedPlayer', { player: result.account.player })}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <WalletMetric
              label={t('siphonBalanceLabel')}
              value={formatSiphonCount(result.account.net, t)}
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
  return t('siphonUnit', { count: `${sign}${Math.abs(n).toLocaleString('en-US')}` })
}
