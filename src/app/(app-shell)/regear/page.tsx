import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Clock, MapPin, Swords, ShieldCheck, Gift, Sparkles, ArrowRight } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession, sessionHas } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getRegearLimits, listMyRegearEligibleEvents, listMyRegearRequests } from '@/app/actions/regear'
import { getRegearPayoutRatePercent } from '@/app/actions/regear-admin-types'
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

export const dynamic = 'force-dynamic'

function formatStartedAt(iso: string, tz: string): string {
  // "MM-DD HH:mm" → "MM/DD HH:mm" (in tenant tz).
  return formatDateTimeShort(iso, tz).replace('-', '/')
}

export default async function RegearPage() {
  const session = await getSession()
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/regear')
  }
  // Guests can't submit regear (Option B scope: slots only). Send them home
  // so they don't see an action page that immediately errors.
  if (!session.isMember) {
    redirect('/')
  }

  const guildId = await getSessionGuildId(session)
  const [
    { events, error },
    { requests: myRegears },
    limits,
    payoutRatePercent,
    t,
    tRole,
    locale,
    noticeMessage,
    noticeImageUrl,
    tz,
    craftEnabledRaw,
    craftIncludeCapeRaw,
    overchargeEnabledRaw,
  ] = await Promise.all([
    listMyRegearEligibleEvents(),
    listMyRegearRequests(),
    getRegearLimits(),
    getRegearPayoutRatePercent(),
    getTranslations('regear'),
    getTranslations('slotRole'),
    getLocale(),
    getAppSetting('regear_notice_message', '', guildId),
    getAppSetting('regear_notice_image_url', '', guildId),
    getTenantTimezone(guildId),
    getAppSetting('craft_regear_enabled', 'false', guildId),
    getAppSetting('craft_regear_include_cape', 'false', guildId),
    getAppSetting('regear_overcharge_enabled', 'false', guildId),
  ])
  const craftEnabled = craftEnabledRaw === 'true'
  const craftIncludeCapeDefault = craftIncludeCapeRaw === 'true'
  const overchargeEnabled = overchargeEnabledRaw === 'true'

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">{t('pageTitle')}</h1>
          <p className="text-gray-400 text-sm">{t('pageDescription')}</p>
        </div>
        {session.isAdmin && (
          <Link
            href="/admin/dashboard/regear-windows"
            className="inline-flex items-center gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
          >
            <Gift size={14} />
            {t('adminEntry')}
          </Link>
        )}
      </div>

      <NoticeBannerWithAdmin
        message={noticeMessage}
        imageUrl={noticeImageUrl}
        target="regear"
        canManageNotice={sessionHas(session, CAP.SETTINGS_GENERAL)}
      />

      <RegearWindowsSection />

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      <div data-tour-id="member-tour-regear">
        <RegearPageTabs
          eligibleLabel={t('tabEligible')}
          historyLabel={t('tabHistory')}
          eligibleCount={events.length}
          historyCount={myRegears.length}
          eligibleSection={
            events.length === 0 ? (
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center space-y-2">
                <ShieldCheck size={28} className="text-gray-600 mx-auto" />
                <p className="text-gray-400 text-sm">{t('noEligible')}</p>
                <p className="text-gray-600 text-xs">{t('noEligibleHint')}</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {events.map((event) => {
                  const showRequestButton =
                    !event.auto_request_id ||
                    overchargeEnabled ||
                    event.existing_active_count < event.max_deaths_per_member
                  const roleLabel = event.role_name
                    ? translateSlotRole(event.role_name, tRole)
                    : t('unassigned')
                  return (
                    <li
                      key={event.id}
                      className="bg-gray-900 border border-gray-700 rounded-2xl p-4 sm:p-5 space-y-3"
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
                          {showRequestButton && (
                            <RegearRequestButton
                              eventId={event.id}
                              roleName={event.role_name}
                              roleReward={event.role_reward}
                              eventRegearDisabled={event.regear_policy === 'disabled'}
                              existingActiveCount={event.existing_active_count}
                              maxDeaths={event.max_deaths_per_member}
                              payoutRatePercent={payoutRatePercent}
                              windowOpenAt={event.window_open_at}
                              windowMinutes={limits.windowMinutes}
                              craftEnabled={craftEnabled}
                              craftIncludeCapeDefault={craftIncludeCapeDefault}
                              overchargeEnabled={overchargeEnabled}
                            />
                          )}
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
      </div>

      <AdHocDeathsSection />
    </main>
  )
}
