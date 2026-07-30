import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Clock, MapPin, Swords, ShieldCheck, Gift, Sparkles, ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getRegearLimits, listMyRegearEligibleEvents, listMyRegearRequests } from '@/app/actions/regear'
import { getRegearPayoutRateConfig } from '@/app/actions/regear-admin-types'
import { formatSilver } from '@/lib/silver'
import { formatGatherTimeFor } from '@/lib/gather-time'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { getLocale } from '@/lib/locale'
import { getAppSetting } from '@/lib/app-settings'
import { getTenantTimezone } from '@/lib/timezone-server'
import RegearRequestButton from '@/components/RegearRequestButton'
import RegearWindowsSection from '@/components/RegearWindowsSection'
import AdHocDeathsSection from '@/components/AdHocDeathsSection'
import NoticeBannerWithAdmin from '@/components/NoticeBannerWithAdmin'
import MyRegearList from '@/components/MyRegearList'
import RegearPageTabs from '@/components/RegearPageTabs'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { CAP } from '@/lib/permissions'
import { getMyAllianceContentRegearVideoContext } from '@/lib/alliance-content-regear-data'
import { PageHeader, QueueSurface, cx, pressScaleClass } from '@/components/ui-patterns'
import { getRegearSupportConfiguration } from '@/lib/regear-support-server'

export const dynamic = 'force-dynamic'

function formatStartedAt(iso: string, tz: string): string {
  // "MM-DD HH:mm" → "MM/DD HH:mm" (in tenant tz).
  return formatDateTimeShort(iso, tz).replace('-', '/')
}

export default async function RegearPage() {
  const session = await getSession()
  if (!session) {
    redirect('/login?returnTo=%2Fregear')
  }
  // Guests can't submit regear (Option B scope: slots only). Send them home
  // so they don't see an action page that immediately errors.
  if (!session.isMember) {
    redirect('/')
  }

  const guildId = await getSessionGuildId(session)
  const regearSupport = await getRegearSupportConfiguration(guildId)
  const [
    { events, error },
    { requests: myRegears },
    limits,
    payoutRateConfig,
    t,
    tRole,
    locale,
    noticeMessage,
    noticeImageUrl,
    tz,
    craftEnabledRaw,
    craftIncludeCapeRaw,
    overchargeEnabledRaw,
    allianceContentContext,
  ] = await Promise.all([
    regearSupport.supported
      ? listMyRegearEligibleEvents()
      : Promise.resolve({ events: [], error: undefined }),
    listMyRegearRequests(),
    getRegearLimits(),
    getRegearPayoutRateConfig(),
    getTranslations('regear'),
    getTranslations('slotRole'),
    getLocale(),
    getAppSetting('regear_notice_message', '', guildId),
    getAppSetting('regear_notice_image_url', '', guildId),
    getTenantTimezone(guildId),
    getAppSetting('craft_regear_enabled', 'false', guildId),
    getAppSetting('craft_regear_include_cape', 'false', guildId),
    getAppSetting('regear_overcharge_enabled', 'false', guildId),
    getMyAllianceContentRegearVideoContext(guildId, session.discordId),
  ])
  const craftEnabled = craftEnabledRaw === 'true'
  const craftIncludeCapeDefault = craftIncludeCapeRaw === 'true'
  const overchargeEnabled = overchargeEnabledRaw === 'true'

  return (
    <main className="v3-regear-workspace flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <PageHeader
        title={t('pageTitle')}
        description={t('pageDescription')}
        actions={session.isAdmin && regearSupport.supported ? (
          <Link
            href="/admin/dashboard/regear-windows"
            className={cx(
              'inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-accent/35 bg-accent-soft px-3 py-2 text-xs font-semibold text-accent-soft-foreground transition-colors hover:border-accent/60',
              pressScaleClass,
            )}
          >
            <Gift size={14} aria-hidden="true" />
            {t('adminEntry')}
          </Link>
        ) : undefined}
      />

      {!regearSupport.supported && (
        <section className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-sky-100">
            {t('supportDisabledTitle')}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-sky-100/70">
            {t('supportDisabledDescription')}
          </p>
        </section>
      )}

      <NoticeBannerWithAdmin
        message={noticeMessage}
        imageUrl={noticeImageUrl}
        target="regear"
        canManageNotice={sessionHas(session, CAP.SETTINGS_GENERAL)}
      />

      {regearSupport.supported && (
        <RegearWindowsSection allianceContentOption={allianceContentContext.option} />
      )}

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <QueueSurface data-tour-id="member-tour-regear">
        {regearSupport.supported ? (
          <RegearPageTabs
          eligibleLabel={t('tabEligible')}
          historyLabel={t('tabHistory')}
          eligibleCount={events.length}
          historyCount={myRegears.length}
          eligibleSection={
            events.length === 0 ? (
              <div className="space-y-2 border-y border-border py-10 text-center">
                <ShieldCheck size={28} className="text-gray-600 mx-auto" />
                <p className="text-gray-400 text-sm">{t('noEligible')}</p>
                <p className="text-gray-600 text-xs">{t('noEligibleHint')}</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {events.map((event) => {
                  const roleLabel = event.role_name
                    ? translateSlotRole(event.role_name, tRole)
                    : t('unassigned')
                  return (
                    <li
                      key={event.id}
                      className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-card sm:p-5"
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <Link
                              href={`/events/${event.id}`}
                              className="text-base sm:text-lg font-bold text-white hover:text-amber-300 truncate"
                            >
                              {event.title}
                            </Link>
                            <span className="inline-flex items-center gap-1 bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0">
                              <Swords size={10} />
                              {t('battleStartedAt', { time: formatStartedAt(event.battle_started_at, tz) })}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                            <div className="flex items-center gap-1.5 text-gray-300">
                              <Clock size={13} className="text-amber-400" />
                              {event.gather_at ? formatGatherTimeFor(locale, event.gather_at, tz) : event.gather_time}
                            </div>
                            {event.gather_location.trim() && (
                              <div className="flex items-center gap-1.5 text-gray-300">
                                <MapPin size={13} className="text-amber-400" />
                                {event.gather_location}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-800">
                        <div className="text-xs text-gray-400 min-w-0 flex-1">
                          <span className="text-gray-500">{t('role')} </span>
                          <span className="text-white font-semibold">{roleLabel}</span>
                          <span className="text-gray-500"> · {t('expectedReward')} </span>
                          <span className="text-amber-400 font-mono font-semibold">{formatSilver(event.role_reward)}</span>
                          <span className="text-gray-500"> · {t('requestDeadline')} </span>
                          <span className="text-gray-300">{formatStartedAt(event.deadline_at, tz)}</span>
                        </div>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          {event.auto_request_id && (
                            <Link
                              href={`/me/regear/${event.auto_request_id}`}
                              className="flex items-center gap-1.5 text-xs font-medium text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg px-3 py-2"
                            >
                              <Sparkles size={13} />
                              {t('autoClaimedView')}
                              <ArrowRight size={12} />
                            </Link>
                          )}
                          <RegearRequestButton
                            eventId={event.id}
                            roleName={event.role_name}
                            roleReward={event.role_reward}
                            rolePolicyEnabled={event.role_policy_enabled}
                            rolePolicyMatchStatus={event.role_policy_match_status}
                            rolePolicyDiscordRoleName={event.role_policy_discord_role_name}
                            rolePolicySilverCap={event.role_policy_silver_cap}
                            eventRegearDisabled={event.regear_policy === 'disabled'}
                            existingActiveCount={event.existing_active_count}
                            maxDeaths={event.max_deaths_per_member}
                            payoutRatePercent={
                              event.role_payout_rate_percent ?? payoutRateConfig.baseRatePercent
                            }
                            videoPayoutRatePercent={event.video_payout_rate_percent}
                            videoClaimCeilingBonusSilver={event.video_claim_ceiling_bonus_silver}
                            videoRateAppliesWithoutProof={event.video_rate_applies_without_proof}
                            windowOpenAt={event.window_open_at}
                            windowMinutes={limits.windowMinutes}
                            craftEnabled={craftEnabled}
                            craftIncludeCapeDefault={craftIncludeCapeDefault}
                            overchargeEnabled={overchargeEnabled}
                            allianceContentOption={allianceContentContext.option}
                            allianceContentSourceBattleIds={event.matched_albion_battle_ids}
                            timezone={tz}
                          />
                        </div>
                      </div>
                      {event.auto_request_id && (
                        <div className="-mt-1 flex items-center gap-2 text-[11px] text-emerald-300/80">
                          <Sparkles size={12} />
                          <span>{t('autoClaimedLabel')}</span>
                          <span className="text-gray-500">·</span>
                          <span className="text-gray-400 leading-snug">{t('autoClaimedHint')}</span>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )
          }
            historySection={<MyRegearList requests={myRegears} timezone={tz} />}
          />
        ) : (
          <section className="space-y-3">
            <h2 className="text-base font-bold text-white">{t('historyOnlyTitle')}</h2>
            <MyRegearList requests={myRegears} timezone={tz} readOnly />
          </section>
        )}
      </QueueSurface>

      {regearSupport.supported && (
        <AdHocDeathsSection allianceContentOption={allianceContentContext.option} />
      )}
    </main>
  )
}
