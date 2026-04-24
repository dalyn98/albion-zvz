import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Bell, Calendar, Coins, Heart, Swords, Trophy } from 'lucide-react'
import { formatSilver } from '@/lib/silver'
import { formatGatherTimeFor } from '@/lib/gather-time'
import { getLocale } from '@/lib/locale'
import type { MyDashboardData } from '@/app/actions/me-dashboard'
import { translateSlotRole } from '@/lib/slot-role-i18n'

function formatKd(kills: number, deaths: number): string {
  if (deaths === 0) {
    if (kills === 0) return '-'
    return `${kills}.00`
  }
  return (kills / deaths).toFixed(2)
}

function survivalTone(rate: number | null): string {
  if (rate == null) return 'text-gray-400'
  if (rate >= 0.8) return 'text-emerald-300'
  if (rate >= 0.5) return 'text-amber-300'
  return 'text-rose-300'
}

function winRateTone(rate: number | null): string {
  if (rate == null) return 'text-gray-400'
  if (rate >= 0.6) return 'text-emerald-300'
  if (rate >= 0.4) return 'text-amber-300'
  return 'text-rose-300'
}

interface Props {
  data: MyDashboardData
}

export default async function MyHomeDashboardCard({ data }: Props) {
  const t = await getTranslations('me')
  const tRole = await getTranslations('slotRole')
  const locale = await getLocale()

  const kd = formatKd(data.kills, data.deaths)
  const survivalText =
    data.survivalRate == null
      ? '—'
      : `${Math.round(data.survivalRate * 100)}%`
  const winRateText =
    data.winRate == null
      ? '—'
      : `${Math.round(data.winRate * 100)}%`
  const pendingTotal =
    data.pendingRegearCount + data.pendingExchangeCount + data.pendingDonationCount

  return (
    <section className="bg-gray-900 border border-gray-700 rounded-2xl p-5 sm:p-6 space-y-5">
      <div>
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">
          {t('homeNextEvent')}
        </p>
        {data.nextUpcomingEvent ? (
          <Link
            href={`/events/${data.nextUpcomingEvent.id}`}
            className="flex items-center gap-3 bg-gray-800/60 border border-gray-700 hover:border-amber-500/40 rounded-lg px-3 py-2 transition-colors"
          >
            <Calendar size={18} className="text-amber-400 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-semibold truncate">
                {data.nextUpcomingEvent.title}
              </p>
              <p className="text-gray-400 text-xs">
                {data.nextUpcomingEvent.gather_at
                  ? formatGatherTimeFor(locale, data.nextUpcomingEvent.gather_at)
                  : data.nextUpcomingEvent.gather_time}
                {data.nextUpcomingEvent.role_name && (
                  <span className="ml-2 text-gray-500">
                    · {translateSlotRole(data.nextUpcomingEvent.role_name, tRole)}
                  </span>
                )}
              </p>
            </div>
          </Link>
        ) : (
          <p className="text-gray-500 text-sm py-2">{t('homeNoUpcoming')}</p>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <HomeMetric
          icon={<Coins size={14} />}
          label={t('homeMetricPoints')}
          value={formatSilver(data.balance)}
          mono
        />
        <HomeMetric
          icon={<Calendar size={14} />}
          label={t('homeMetricParticipation')}
          value={String(data.participationCount)}
          mono
          sub={
            data.participationCurrentStreak > 0
              ? t('homeMetricStreakSub', { days: data.participationCurrentStreak })
              : undefined
          }
        />
        <HomeMetric
          icon={<Swords size={14} />}
          label={t('homeMetricKd')}
          value={kd}
          mono
          sub={t('homeMetricKdSub', { kills: data.kills, deaths: data.deaths })}
        />
        <HomeMetric
          icon={<Heart size={14} />}
          label={t('homeMetricSurvival')}
          value={survivalText}
          mono
          valueClass={survivalTone(data.survivalRate)}
          sub={
            data.evaluatedEvents > 0
              ? t('homeMetricEvaluatedSub', { count: data.evaluatedEvents })
              : undefined
          }
        />
        <HomeMetric
          icon={<Trophy size={14} />}
          label={t('homeMetricWinRate')}
          value={winRateText}
          mono
          valueClass={winRateTone(data.winRate)}
          sub={
            data.evaluatedOutcomeEvents > 0
              ? t('homeMetricWinLossSub', { wins: data.wins, losses: data.losses })
              : undefined
          }
        />
      </div>

      <div className="text-gray-500 text-[11px]">
        {t('summary', {
          earned: formatSilver(data.lifetimeEarned),
          spent: formatSilver(data.lifetimeSpent),
        })}
      </div>

      {pendingTotal > 0 && (
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-lg px-3 py-2 text-xs">
          <Bell size={14} className="flex-shrink-0" />
          <span>
            {t('homePendingPrefix')}{' '}
            {data.pendingRegearCount > 0 && (
              <span className="font-semibold">
                {t('homePendingRegear', { count: data.pendingRegearCount })}
              </span>
            )}
            {data.pendingExchangeCount > 0 && (
              <>
                {data.pendingRegearCount > 0 && <span className="mx-1 opacity-60">·</span>}
                <span className="font-semibold">
                  {t('homePendingExchange', { count: data.pendingExchangeCount })}
                </span>
              </>
            )}
            {data.pendingDonationCount > 0 && (
              <>
                {(data.pendingRegearCount > 0 || data.pendingExchangeCount > 0) && (
                  <span className="mx-1 opacity-60">·</span>
                )}
                <span className="font-semibold">
                  {t('homePendingDonation', { count: data.pendingDonationCount })}
                </span>
              </>
            )}
          </span>
        </div>
      )}
    </section>
  )
}

function HomeMetric({
  icon,
  label,
  value,
  sub,
  mono,
  valueClass,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
  mono?: boolean
  valueClass?: string
}) {
  return (
    <div className="bg-gray-800/50 border border-gray-800 rounded-lg px-3 py-2">
      <div className="flex items-center gap-1.5 text-gray-400 text-[10px] font-semibold uppercase tracking-wider">
        <span className="text-amber-400/80">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <p
        className={`mt-1 text-base sm:text-lg font-semibold ${mono ? 'font-mono' : ''} ${
          valueClass ?? 'text-white'
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-gray-500 text-[10px] mt-0.5 truncate">{sub}</p>}
    </div>
  )
}
