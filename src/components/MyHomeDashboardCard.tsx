import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { Activity, Bell, Calendar, Coins, Heart, Skull, Swords, Trophy } from 'lucide-react'
import { formatSilver } from '@/lib/silver'
import { formatGatherTimeFor } from '@/lib/gather-time'
import { getLocale } from '@/lib/locale'
import type { MyDashboardData } from '@/app/actions/me-dashboard'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { MetricStrip } from '@/components/ui-patterns'

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
  // app_settings.me_weekly_stats_enabled — false 거나 weekBattleCount 가 0 이면
  // 위젯 자체를 숨긴다. 빈 섹션이 보이면 더 시끄럽다.
  weeklyStatsEnabled?: boolean
  eventHrefPrefix?: string
  timezone?: string
}

export default async function MyHomeDashboardCard({
  data,
  weeklyStatsEnabled = false,
  eventHrefPrefix = '/events',
  timezone,
}: Props) {
  const t = await getTranslations('me')
  const tWeekly = await getTranslations('me.weekly')
  const tRole = await getTranslations('slotRole')
  const locale = await getLocale()

  const showWeekly = weeklyStatsEnabled && data.weekBattleCount > 0
  const weekWinRatePercent =
    data.weekWins + data.weekLosses > 0
      ? Math.round((data.weekWins / (data.weekWins + data.weekLosses)) * 100)
      : null

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
  const nextEvent = data.nextActionEvent ?? data.nextUpcomingEvent

  return (
    <section className="v3-member-overview bg-gray-900 border border-gray-700 rounded-2xl p-5 sm:p-6 space-y-5">
      <div>
        <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-2">
          {t('homeNextEvent')}
        </p>
        {nextEvent ? (
          <Link
            href={`${eventHrefPrefix}/${nextEvent.id}`}
            className="flex items-center gap-3 bg-gray-800/60 border border-gray-700 hover:border-amber-500/40 rounded-lg px-3 py-2 transition-colors"
          >
            <Calendar size={18} className="text-amber-400 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-semibold truncate">
                {nextEvent.title}
              </p>
              <p className="text-gray-400 text-xs">
                {nextEvent.gather_at
                  ? formatGatherTimeFor(locale, nextEvent.gather_at, timezone)
                  : nextEvent.gather_time}
                {nextEvent.role_name && (
                  <span className="ml-2 text-gray-500">
                    · {translateSlotRole(nextEvent.role_name, tRole)}
                  </span>
                )}
              </p>
            </div>
          </Link>
        ) : (
          <p className="text-gray-500 text-sm py-2">{t('homeNoUpcoming')}</p>
        )}
      </div>

      <MetricStrip
        className="v3-member-metrics"
        items={[
          {
            label: <MetricLabel icon={<Coins size={14} />} label={t('homeMetricPoints')} />,
            value: formatSilver(data.balance),
          },
          {
            label: <MetricLabel icon={<Calendar size={14} />} label={t('homeMetricParticipation')} />,
            value: String(data.participationCount),
            detail: data.participationCurrentStreak > 0
              ? t('homeMetricStreakSub', { days: data.participationCurrentStreak })
              : undefined,
          },
          {
            label: <MetricLabel icon={<Swords size={14} />} label={t('homeMetricKd')} />,
            value: kd,
            detail: t('homeMetricKdSub', { kills: data.kills, deaths: data.deaths }),
          },
          {
            label: <MetricLabel icon={<Heart size={14} />} label={t('homeMetricSurvival')} />,
            value: <span className={survivalTone(data.survivalRate)}>{survivalText}</span>,
            detail: data.evaluatedEvents > 0
              ? t('homeMetricEvaluatedSub', { count: data.evaluatedEvents })
              : undefined,
          },
          {
            label: <MetricLabel icon={<Trophy size={14} />} label={t('homeMetricWinRate')} />,
            value: <span className={winRateTone(data.winRate)}>{winRateText}</span>,
            detail: data.evaluatedOutcomeEvents > 0
              ? t('homeMetricWinLossSub', { wins: data.wins, losses: data.losses })
              : undefined,
          },
        ]}
      />

      <div className="text-gray-500 text-[11px]">
        {t('summary', {
          earned: formatSilver(data.lifetimeEarned),
          spent: formatSilver(data.lifetimeSpent),
        })}
      </div>

      {showWeekly && (
        <div className="border-t border-gray-800 pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity size={14} className="text-amber-400" />
            <h3 className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
              {tWeekly('title')}
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <WeeklyStat
              icon={<Swords size={14} className="text-amber-400" />}
              label={tWeekly('battles')}
              value={data.weekBattleCount.toLocaleString()}
            />
            <WeeklyStat
              icon={<Trophy size={14} className="text-emerald-400" />}
              label={tWeekly('winRate')}
              value={weekWinRatePercent == null ? '—' : `${weekWinRatePercent}%`}
              sub={
                data.weekWins + data.weekLosses > 0
                  ? tWeekly('winLossSub', { wins: data.weekWins, losses: data.weekLosses })
                  : undefined
              }
            />
            <WeeklyStat
              icon={<Swords size={14} className="text-emerald-400" />}
              label={tWeekly('kills')}
              value={data.weekKills.toLocaleString()}
            />
            <WeeklyStat
              icon={<Skull size={14} className="text-rose-400" />}
              label={tWeekly('deaths')}
              value={data.weekDeaths.toLocaleString()}
            />
          </div>
        </div>
      )}

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

function MetricLabel({
  icon,
  label,
}: {
  icon: React.ReactNode
  label: string
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-amber-400/80">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  )
}

function WeeklyStat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-400 uppercase tracking-wide">
        {icon}
        {label}
      </div>
      <p className="text-white text-xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-gray-500 text-[11px] font-mono">{sub}</p>}
    </div>
  )
}
