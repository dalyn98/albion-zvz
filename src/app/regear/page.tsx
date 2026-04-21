import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Clock, MapPin, Swords, ShieldCheck } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getRegearLimits, listMyRegearEligibleEvents } from '@/app/actions/regear'
import { getRegearPayoutRatePercent } from '@/app/actions/regear-admin'
import { formatSilver } from '@/lib/silver'
import { formatGatherTimeFor } from '@/lib/gather-time'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { getLocale } from '@/lib/locale'
import { getAppSetting } from '@/lib/app-settings'
import RegearRequestButton from '@/components/RegearRequestButton'
import DismissibleNoticeBanner from '@/components/DismissibleNoticeBanner'

export const dynamic = 'force-dynamic'

function formatStartedAt(iso: string): string {
  // "MM-DD HH:mm" → "MM/DD HH:mm" (KST, via formatDateTimeShort).
  return formatDateTimeShort(iso).replace('-', '/')
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

  const [{ events, error }, limits, payoutRatePercent, t, locale, noticeMessage] = await Promise.all([
    listMyRegearEligibleEvents(),
    getRegearLimits(),
    getRegearPayoutRatePercent(),
    getTranslations('regear'),
    getLocale(),
    getAppSetting('regear_notice_message', ''),
  ])

  return (
    <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">{t('pageTitle')}</h1>
        <p className="text-gray-400 text-sm">{t('pageDescription')}</p>
      </div>

      <DismissibleNoticeBanner storageKey="regear" message={noticeMessage} />

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}

      {events.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 text-center space-y-2">
          <ShieldCheck size={28} className="text-gray-600 mx-auto" />
          <p className="text-gray-400 text-sm">{t('noEligible')}</p>
          <p className="text-gray-600 text-xs">{t('noEligibleHint')}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
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
                      {t('battleStartedAt', { time: formatStartedAt(event.battle_started_at) })}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <div className="flex items-center gap-1.5 text-gray-300">
                      <Clock size={13} className="text-amber-400" />
                      {event.gather_at ? formatGatherTimeFor(locale, event.gather_at) : event.gather_time}
                    </div>
                    <div className="flex items-center gap-1.5 text-gray-300">
                      <MapPin size={13} className="text-amber-400" />
                      {event.gather_location}
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-gray-800">
                <div className="text-xs text-gray-400 min-w-0">
                  <span className="text-gray-500">{t('role')} </span>
                  <span className="text-white font-semibold">{event.role_name}</span>
                  <span className="text-gray-500"> · {t('expectedReward')} </span>
                  <span className="text-amber-400 font-mono font-semibold">{formatSilver(event.role_reward)}</span>
                </div>
                <RegearRequestButton
                  eventId={event.id}
                  roleName={event.role_name}
                  roleReward={event.role_reward}
                  existingActiveCount={event.existing_active_count}
                  maxDeaths={limits.maxDeaths}
                  windowMinutes={limits.windowMinutes}
                  payoutRatePercent={payoutRatePercent}
                  battleStartedAt={event.battle_started_at}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
