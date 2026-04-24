import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  ArrowLeft,
  Trophy,
  Sword,
  Skull,
  Target,
  Heart,
  Users,
  Banknote,
  Swords,
  ShieldCheck,
  Clock,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getEventReport } from '@/app/actions/event-report'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { formatSilver } from '@/lib/silver'
import MemberAvatar from '@/components/MemberAvatar'
import { translateSlotRole } from '@/lib/slot-role-i18n'

export const dynamic = 'force-dynamic'

export default async function EventReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getSession()
  if (!session) {
    redirect(`/api/auth/discord/start?returnTo=${encodeURIComponent(`/events/${id}/report`)}`)
  }

  const [result, t, tRole] = await Promise.all([
    getEventReport(id),
    getTranslations('eventReport'),
    getTranslations('slotRole'),
  ])
  if (!result) notFound()
  const { event, report } = result

  const outcomeLabel =
    event.outcome === 'win'
      ? t('outcomeWin')
      : event.outcome === 'loss'
        ? t('outcomeLoss')
        : t('outcomeUndecided')
  const outcomeClass =
    event.outcome === 'win'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      : event.outcome === 'loss'
        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
        : 'bg-gray-800 text-gray-400 border-gray-700'

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <Link
        href={`/events/${id}`}
        className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-sm transition-colors"
      >
        <ArrowLeft size={14} />
        {t('backToEvent')}
      </Link>

      <header className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-1">
              {t('reportLabel')}
            </p>
            <h1 className="text-xl sm:text-2xl font-bold text-white">{event.title}</h1>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full border ${outcomeClass}`}
          >
            <Trophy size={13} />
            {outcomeLabel}
          </span>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <Clock size={12} className="text-amber-400" />
            {formatDateTimeShort(event.battle_started_at)} –{' '}
            {formatDateTimeShort(event.battle_ended_at)}
          </span>
          {event.finalized_at && (
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={12} className="text-emerald-400" />
              {t('finalizedAt', { at: formatDateTimeShort(event.finalized_at) })}
            </span>
          )}
        </div>
      </header>

      {report.battles.length > 0 && (
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
            <Swords size={14} className="text-rose-400" />
            {t('battlesTitle')}
          </h2>
          <ul className="space-y-1.5">
            {report.battles.map((b) => {
              const won = b.outcome === 'win'
              return (
                <li
                  key={b.battle_number}
                  className="flex items-center justify-between gap-3 bg-gray-950/60 border border-gray-800 rounded-lg px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-gray-500 font-mono w-6">#{b.battle_number}</span>
                    <span className="text-gray-300 truncate">{b.opponent_guild}</span>
                  </div>
                  <span
                    className={`font-bold px-2 py-0.5 rounded ${
                      won
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {won ? t('outcomeWin') : t('outcomeLoss')}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label={t('kpiAttendees')}
          value={report.participation.uniqueAttendees}
          suffix={t('kpiAttendeesSuffix', {
            assigned: report.participation.assignedSlots,
            total: report.participation.totalSlots,
          })}
          icon={<Users size={14} className="text-amber-400" />}
        />
        <KpiCard
          label={t('kpiKills')}
          value={report.combat.totalKills}
          icon={<Sword size={14} className="text-red-400" />}
        />
        <KpiCard
          label={t('kpiDeaths')}
          value={report.combat.totalDeaths}
          icon={<Skull size={14} className="text-gray-400" />}
        />
        <KpiCard
          label={t('kpiKd')}
          value={report.combat.kdRatio === null ? '-' : report.combat.kdRatio.toFixed(2)}
          icon={<Target size={14} className="text-amber-300" />}
        />
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
          <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
            <Heart size={14} className="text-emerald-400" />
            {t('survivalTitle')}
          </h2>
          {report.survival.attended === 0 ? (
            <p className="text-gray-500 text-xs text-center py-4">{t('survivalEmpty')}</p>
          ) : (
            <>
              <p className="text-2xl font-bold text-emerald-400 font-mono">
                {report.survival.rate === null
                  ? '-'
                  : `${Math.round(report.survival.rate * 100)}%`}
              </p>
              <p className="text-[11px] text-gray-500">
                {t('survivalSub', {
                  survived: report.survival.survived,
                  attended: report.survival.attended,
                  died: report.survival.died,
                })}
              </p>
            </>
          )}
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
          <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
            <Banknote size={14} className="text-amber-300" />
            {t('regearTitle')}
          </h2>
          {report.regear.totalClaims === 0 ? (
            <p className="text-gray-500 text-xs text-center py-4">{t('regearEmpty')}</p>
          ) : (
            <>
              <p className="text-2xl font-bold text-amber-300 font-mono">
                {formatSilver(report.regear.totalPayoutSilver)}
              </p>
              <p className="text-[11px] text-gray-500">
                {t('regearSub', {
                  approved: report.regear.approvedCount,
                  pending: report.regear.pendingCount,
                  rejected: report.regear.rejectedCount,
                })}
              </p>
            </>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LeaderCard
          title={t('topKillersTitle')}
          icon={<Sword size={14} className="text-red-400" />}
          leaders={report.combat.topKillers}
          emptyText={t('leaderEmpty')}
          formatValue={(l) => l.kills.toLocaleString()}
          formatSub={(l) => t('killDeathsSub', { kills: l.kills, deaths: l.deaths })}
        />
        <LeaderCard
          title={t('topKdTitle')}
          icon={<Target size={14} className="text-amber-300" />}
          leaders={report.combat.topKD}
          emptyText={t('leaderEmpty')}
          formatValue={(l) => (l.ratio === null ? '-' : l.ratio.toFixed(2))}
          formatSub={(l) => t('killDeathsSub', { kills: l.kills, deaths: l.deaths })}
        />
      </section>

      {report.participation.roleBreakdown.length > 0 && (
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
            <Users size={14} className="text-amber-400" />
            {t('rolesTitle')}
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {report.participation.roleBreakdown.map((r) => (
              <li
                key={r.role}
                className="flex items-center gap-1.5 bg-gray-950/60 border border-gray-800 rounded-full px-2.5 py-1 text-xs"
              >
                <span className="text-gray-300 font-semibold">{translateSlotRole(r.role, tRole)}</span>
                <span className="text-amber-300 font-mono font-bold">{r.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

interface KpiCardProps {
  label: string
  value: number | string
  suffix?: string
  icon: React.ReactNode
}

function KpiCard({ label, value, suffix, icon }: KpiCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-semibold">
        {icon}
        {label}
      </div>
      <p className="text-xl font-bold text-white font-mono tabular-nums">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {suffix && <p className="text-[10px] text-gray-500">{suffix}</p>}
    </div>
  )
}

import type { CombatLeader } from '@/lib/event-report'

interface LeaderCardProps {
  title: string
  icon: React.ReactNode
  leaders: CombatLeader[]
  emptyText: string
  formatValue: (leader: CombatLeader) => string
  formatSub: (leader: CombatLeader) => string
}

function LeaderCard({ title, icon, leaders, emptyText, formatValue, formatSub }: LeaderCardProps) {
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
      <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
        {icon}
        {title}
      </h2>
      {leaders.length === 0 ? (
        <p className="text-gray-500 text-xs text-center py-4">{emptyText}</p>
      ) : (
        <ol className="space-y-1">
          {leaders.map((leader, idx) => (
            <li key={leader.discord_id}>
              <Link
                href={`/members/${leader.discord_id}`}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800/70 transition-colors"
              >
                <span
                  className={`w-6 text-center text-xs font-bold tabular-nums flex-shrink-0 ${
                    idx === 0
                      ? 'text-amber-400'
                      : idx === 1
                        ? 'text-slate-300'
                        : idx === 2
                          ? 'text-orange-400'
                          : 'text-gray-500'
                  }`}
                >
                  {idx + 1}
                </span>
                <MemberAvatar discordId={leader.discord_id} avatar={leader.avatar} size={22} />
                <div className="min-w-0 flex-1">
                  <p className="text-white text-xs font-medium truncate">{leader.username}</p>
                  <p className="text-gray-500 text-[10px] truncate">{formatSub(leader)}</p>
                </div>
                <span className="text-amber-300 text-sm font-mono font-bold tabular-nums flex-shrink-0">
                  {formatValue(leader)}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
