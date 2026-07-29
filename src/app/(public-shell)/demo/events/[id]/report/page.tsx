import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  ClipboardCheck,
  Clock,
  Heart,
  ShieldCheck,
  Skull,
  Sword,
  Swords,
  Target,
  Trophy,
  Users,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import {
  DEMO_EVENTS,
  getDemoEventReport,
  type DemoEventReportLeader,
  type DemoEventReportParticipant,
} from '@/data/demo-seed'
import { formatSilver } from '@/lib/silver'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { formatTimeLabel } from '../../../_lib/format'

export const dynamic = 'force-dynamic'

export default async function DemoEventReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const event = DEMO_EVENTS.find((candidate) => candidate.id === id)
  const report = getDemoEventReport(id)
  if (!event || !report) notFound()

  const [t, tDemo, tRole] = await Promise.all([
    getTranslations('eventReport'),
    getTranslations('demo'),
    getTranslations('slotRole'),
  ])

  const outcomeLabel =
    report.outcome === 'win'
      ? t('outcomeWin')
      : report.outcome === 'loss'
        ? t('outcomeLoss')
        : t('outcomeUndecided')
  const outcomeClass =
    report.outcome === 'win'
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      : report.outcome === 'loss'
        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
        : 'bg-gray-800 text-gray-400 border-gray-700'

  return (
    <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-6 sm:py-8 space-y-6">
      <Link
        href={`/demo/events/${id}`}
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
            <h1 className="text-xl sm:text-2xl font-bold text-white">{event.name}</h1>
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
            {formatTimeLabel(tDemo, event.scheduledAt)}
          </span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={12} className="text-emerald-400" />
            {event.zone}
          </span>
        </div>
      </header>

      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
          <Swords size={14} className="text-rose-400" />
          {t('battlesTitle')}
        </h2>
        <ul className="space-y-1.5">
          {report.battles.map((battle) => {
            const won = battle.outcome === 'win'
            return (
              <li
                key={battle.battleNumber}
                className="flex items-center justify-between gap-3 bg-gray-950/60 border border-gray-800 rounded-lg px-3 py-2 text-xs"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-gray-500 font-mono w-6">#{battle.battleNumber}</span>
                  <span className="text-gray-300 truncate">{battle.opponentGuild}</span>
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

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label={t('kpiAssigned')}
          value={report.participation.uniqueAssigned}
          suffix={t('kpiAssignedSuffix', {
            assigned: report.participation.assignedSlots,
            total: report.participation.totalSlots,
          })}
          icon={<ClipboardCheck size={14} className="text-indigo-300" />}
        />
        <KpiCard
          label={t('kpiConfirmed')}
          value={report.attendance.confirmedAssigned}
          suffix={
            report.attendance.eventAttendanceRate === null
              ? t('kpiConfirmedNoRate')
              : t('kpiConfirmedRate', {
                  rate: Math.round(report.attendance.eventAttendanceRate * 100),
                })
          }
          icon={<Users size={14} className="text-amber-400" />}
        />
        <KpiCard
          label={t('kpiUnconfirmed')}
          value={report.attendance.unconfirmedAssigned}
          suffix={t('kpiUnconfirmedSuffix')}
          icon={<AlertTriangle size={14} className="text-rose-300" />}
        />
        <KpiCard
          label={t('kpiUnassigned')}
          value={report.attendance.unassignedBattleParticipants}
          suffix={t('kpiUnassignedSuffix', {
            battles: report.attendance.linkedBattleCount,
          })}
          icon={<Swords size={14} className="text-sky-300" />}
        />
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label={t('kpiBattleParticipations')}
          value={report.attendance.battleParticipations}
          suffix={t('kpiBattleParticipationsSuffix', {
            participants: report.attendance.battleParticipants,
          })}
          icon={<Swords size={14} className="text-sky-300" />}
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
          <p className="text-2xl font-bold text-emerald-400 font-mono">
            {report.survival.rate === null ? '-' : `${Math.round(report.survival.rate * 100)}%`}
          </p>
          <p className="text-[11px] text-gray-500">
            {t('survivalSub', {
              survived: report.survival.survived,
              attended: report.survival.attended,
              died: report.survival.died,
            })}
          </p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
          <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
            <Banknote size={14} className="text-amber-300" />
            {t('regearTitle')}
          </h2>
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
        </div>
      </section>

      <section className="space-y-2">
        <LeaderCard
          title={t('topKillersTitle')}
          icon={<Sword size={14} className="text-red-400" />}
          leaders={report.combat.topKillers}
          emptyText={t('leaderEmpty')}
          formatValue={(leader) => leader.kills.toLocaleString('en-US')}
          formatSub={(leader) => t('killDeathsSub', { kills: leader.kills, deaths: leader.deaths })}
        />
        <p className="rounded-lg border border-gray-800 bg-gray-950/40 px-3 py-2 text-[11px] leading-relaxed text-gray-500">
          {t('leaderEvidenceLimit')}
        </p>
      </section>

      <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <header className="px-4 py-3 border-b border-gray-800 flex items-center justify-between gap-3">
          <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
            <Users size={14} className="text-amber-400" />
            {t('attendanceTitle')}
          </h2>
          <span className="text-[11px] text-gray-500">
            {t('attendanceSubtitle', {
              participants: report.attendance.battleParticipants,
              battles: report.attendance.linkedBattleCount,
            })}
          </span>
        </header>
        <ul className="divide-y divide-gray-800">
          {report.attendance.participants.map((participant) => (
            <ParticipantRow key={participant.key} participant={participant} t={t} tRole={tRole} />
          ))}
        </ul>
      </section>

      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
          <Users size={14} className="text-amber-400" />
          {t('rolesTitle')}
        </h2>
        <ul className="flex flex-wrap gap-1.5">
          {report.participation.roleBreakdown.map((row) => (
            <li
              key={row.role}
              className="flex items-center gap-1.5 bg-gray-950/60 border border-gray-800 rounded-full px-2.5 py-1 text-xs"
            >
              <span className="text-gray-300 font-semibold">
                {translateSlotRole(row.role, tRole)}
              </span>
              <span className="text-amber-300 font-mono font-bold">{row.count}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}

interface Translator {
  (key: string, values?: Record<string, string | number>): string
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
        {typeof value === 'number' ? value.toLocaleString('en-US') : value}
      </p>
      {suffix && <p className="text-[10px] text-gray-500">{suffix}</p>}
    </div>
  )
}

interface LeaderCardProps {
  title: string
  icon: React.ReactNode
  leaders: DemoEventReportLeader[]
  emptyText: string
  formatValue: (leader: DemoEventReportLeader) => string
  formatSub: (leader: DemoEventReportLeader) => string
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
            <li key={leader.key}>
              <Link
                href={`/demo/members/${encodeURIComponent(leader.username)}`}
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
                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-800 text-[10px] font-bold text-gray-300">
                  {leader.username.slice(0, 1).toUpperCase()}
                </div>
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

function ParticipantRow({
  participant,
  t,
  tRole,
}: {
  participant: DemoEventReportParticipant
  t: Translator
  tRole: Translator
}) {
  return (
    <li className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 items-center">
      <div className="min-w-0 flex items-center gap-2">
        <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-800 text-[10px] font-bold text-gray-300">
          {participant.username.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <Link
            href={`/demo/members/${encodeURIComponent(participant.username)}`}
            className="text-sm font-medium text-gray-100 truncate block hover:text-amber-200"
          >
            {participant.username}
          </Link>
          <p className="text-[11px] text-gray-500 truncate">
            {participant.role
              ? translateSlotRole(participant.role, tRole)
              : t('attendanceNoSlotRole')}
          </p>
        </div>
      </div>
      <AttendanceStatusBadge
        status={participant.status}
        label={t(`attendanceStatus.${participant.status}`)}
      />
      <span className="hidden sm:inline text-xs text-gray-400 font-mono tabular-nums text-right">
        {t('attendanceBattleCount', { count: participant.battleCount })}
      </span>
      <span className="hidden sm:inline text-xs text-gray-400 font-mono tabular-nums text-right">
        {t('killDeathsSub', {
          kills: participant.kills,
          deaths: participant.deaths,
        })}
      </span>
    </li>
  )
}

function AttendanceStatusBadge({
  status,
  label,
}: {
  status: DemoEventReportParticipant['status']
  label: string
}) {
  const className =
    status === 'confirmed_assigned'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      : status === 'assigned_no_battle'
        ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
        : 'border-sky-500/40 bg-sky-500/10 text-sky-300'
  return (
    <span
      className={`inline-flex justify-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  )
}
