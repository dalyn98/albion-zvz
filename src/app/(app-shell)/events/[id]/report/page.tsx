import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Sword,
  Skull,
  Target,
  Heart,
  Users,
  Banknote,
  Swords,
  Clock,
  CircleMinus,
  AlertTriangle,
  ClipboardCheck,
  PackageSearch,
} from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getEventReport } from '@/app/actions/event-report'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { formatSilver } from '@/lib/silver'
import MemberAvatar from '@/components/MemberAvatar'
import MemberLink from '@/components/MemberLink'
import { translateSlotRole } from '@/lib/slot-role-i18n'
import { getTenantTimezone } from '@/lib/timezone-server'
import {
  resolveEventCloseout,
  type EventCloseoutStepState,
} from '@/lib/event-closeout'

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

  const guildId = await getSessionGuildId(session)
  const [result, t, tRole, tenantTimezone] = await Promise.all([
    getEventReport(id),
    getTranslations('eventReport'),
    getTranslations('slotRole'),
    getTenantTimezone(guildId),
  ])
  if (!result) notFound()
  const { event, report, operations } = result
  const canOpenBattleRecords =
    !session.isGuest &&
    !session.isLocalGuildAccount &&
    (session.isAdmin || session.isMember)
  const battleRequired = event.category === '전투'
  const closeout = resolveEventCloseout({
    battleRequired,
    linkedBattleCount: report.attendance.linkedBattleCount,
    pendingRegearCount: report.regear.pendingCount,
    lootAuditRequired: operations.lootAuditRequired,
    lootAuditSettled: operations.lootAuditSettled === true,
  })
  const latestLootAudit = operations.lootAudits[0]

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
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/15 px-3 py-1 text-sm font-bold text-sky-200">
            <Swords size={13} />
            {t('linkedBattlesBadge', { count: report.attendance.linkedBattleCount })}
          </span>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1.5">
            <Clock size={12} className="text-amber-400" />
            {formatDateTimeShort(event.battle_started_at, tenantTimezone)} –{' '}
            {formatDateTimeShort(event.battle_ended_at, tenantTimezone)}
          </span>
        </div>
      </header>

      {(operations.canReviewRegear || operations.canAuditLoot) && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-white">
                <ClipboardCheck size={15} className="text-amber-300" />
                {t('closeoutTitle')}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-gray-400">
                {t('closeoutDescription')}
              </p>
            </div>
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                closeout.ready
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                  : 'border-amber-500/40 bg-amber-500/15 text-amber-200'
              }`}
            >
              {t(closeout.ready ? 'closeoutReady' : 'closeoutProgress', {
                completed: closeout.completedSteps,
                total: closeout.totalSteps,
              })}
            </span>
          </div>
          <ol className="grid gap-2 lg:grid-cols-3">
            <CloseoutStep
              state={closeout.battle}
              title={t('closeoutBattleTitle')}
              description={
                !battleRequired
                  ? t('closeoutBattleNotApplicable')
                  : report.attendance.linkedBattleCount > 0
                    ? t('closeoutBattleLinked', { count: report.attendance.linkedBattleCount })
                    : t('closeoutBattleMissing')
              }
              href={
                !battleRequired || !canOpenBattleRecords
                  ? undefined
                  : report.battles[0]
                    ? `/battles/${report.battles[0].id}?event=${event.id}&fromEvent=${event.id}#killbot-event-${event.id}`
                    : '/battles'
              }
              actionLabel={t('closeoutBattleAction')}
            />
            <CloseoutStep
              state={closeout.regear}
              title={t('closeoutRegearTitle')}
              description={
                report.regear.pendingCount > 0
                  ? t('closeoutRegearPending', { count: report.regear.pendingCount })
                  : t('closeoutRegearComplete')
              }
              href={
                operations.canReviewRegear
                  ? `/admin/dashboard/approvals?origin=all&scope=all&event=${event.id}`
                  : undefined
              }
              actionLabel={t('closeoutRegearAction')}
            />
            <CloseoutStep
              state={closeout.loot}
              title={t('closeoutLootTitle')}
              description={
                !operations.lootAuditRequired
                  ? t('closeoutLootNotApplicable')
                  : !operations.canAuditLoot
                    ? closeout.loot === 'complete'
                      ? t('closeoutLootComplete')
                      : t('closeoutLootPermissionRequired')
                    : latestLootAudit
                      ? latestLootAudit.unresolvedFindingsCount > 0
                        ? t('closeoutLootOpen', {
                            count: latestLootAudit.unresolvedFindingsCount,
                            amount: formatSilver(latestLootAudit.missingEstimatedValue),
                          })
                        : t('closeoutLootComplete')
                      : t('closeoutLootMissing')
              }
              href={
                operations.lootAuditRequired && operations.canAuditLoot
                  ? latestLootAudit
                    ? `/admin/dashboard/loot-audit/${latestLootAudit.id}`
                    : `/admin/dashboard/loot-audit?event=${event.id}`
                  : undefined
              }
              actionLabel={
                latestLootAudit ? t('closeoutLootReviewAction') : t('closeoutLootCreateAction')
              }
            />
          </ol>
        </section>
      )}

      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
            <Swords size={14} className="text-rose-400" />
            {t('battlesTitle')}
          </h2>
          {canOpenBattleRecords && (
            <Link href="/battles" className="text-xs text-gray-400 hover:text-white">
              {t('battlesViewAll')}
            </Link>
          )}
        </div>
        {report.battles.length > 0 ? (
          <ul className="space-y-1.5">
            {report.battles.map((b) => {
              const content = (
                <>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-gray-500 font-mono w-6">#{b.battle_number}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-gray-200">
                        {b.opponent_force_name}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] text-gray-500">
                        {t('battleScore', {
                          kills: b.subject_kills,
                          deaths: b.subject_deaths,
                          id: b.albion_battle_id,
                        })}
                      </span>
                    </span>
                  </div>
                  <span className="flex flex-shrink-0 items-center gap-2">
                    <BattleResultBadge
                      result={b.result_estimate}
                      label={t(`battleResult.${b.result_estimate}`)}
                    />
                    {canOpenBattleRecords && <ChevronRight size={14} className="text-gray-600" />}
                  </span>
                </>
              )
              return (
                <li key={b.id}>
                  {canOpenBattleRecords ? (
                    <Link
                      href={`/battles/${b.id}?event=${event.id}&fromEvent=${event.id}#killbot-event-${event.id}`}
                      className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-xs transition-colors hover:border-gray-700 hover:bg-gray-800/60"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-xs">
                      {content}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-700 px-4 py-6 text-center">
            <p className="text-sm font-semibold text-gray-300">{t('battlesEmptyTitle')}</p>
            <p className="mt-1 text-xs text-gray-500">{t('battlesEmptyDescription')}</p>
          </div>
        )}
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
          {operations.canReviewRegear && (
            <Link
              href={`/admin/dashboard/approvals?origin=all&scope=all&event=${event.id}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 hover:text-amber-200"
            >
              {t('regearReviewAction')}
              <ArrowRight size={12} />
            </Link>
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

      {report.attendance.participants.length > 0 && (
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
              <li
                key={participant.key}
                className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto_auto] gap-3 px-4 py-3 items-center"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <MemberAvatar
                    discordId={participant.discord_id}
                    avatar={participant.avatar}
                    size={24}
                  />
                  <div className="min-w-0">
                    <MemberLink
                      discordId={participant.discord_id}
                      username={participant.username}
                      className="text-sm font-medium text-gray-100 truncate block"
                    />
                    <p className="text-[11px] text-gray-500 truncate">
                      {participant.role_name
                        ? translateSlotRole(participant.role_name, tRole)
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
            ))}
          </ul>
        </section>
      )}

      {report.participation.roleBreakdown.length > 0 && (
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-white font-bold text-sm flex items-center gap-1.5">
            <Users size={14} className="text-amber-400" />
            {t('rolesTitle')}
          </h2>
          <ul className="flex flex-wrap gap-1.5">
            {report.participation.roleBreakdown.map((r) => (
              <li
                key={r.role ?? '__no_role__'}
                className="flex items-center gap-1.5 bg-gray-950/60 border border-gray-800 rounded-full px-2.5 py-1 text-xs"
              >
                <span className="text-gray-300 font-semibold">
                  {r.role ? translateSlotRole(r.role, tRole) : t('attendanceNoSlotRole')}
                </span>
                <span className="text-amber-300 font-mono font-bold">{r.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

function CloseoutStep({
  state,
  title,
  description,
  href,
  actionLabel,
}: {
  state: EventCloseoutStepState
  title: string
  description: string
  href?: string
  actionLabel: string
}) {
  const complete = state === 'complete'
  const blocked = state === 'blocked'
  const notApplicable = state === 'not_applicable'
  return (
    <li className="flex min-w-0 flex-col rounded-lg border border-white/10 bg-black/20 p-3">
      <div className="flex items-start gap-2">
        {complete ? (
          <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-300" />
        ) : notApplicable ? (
          <CircleMinus size={15} className="mt-0.5 shrink-0 text-gray-500" />
        ) : blocked ? (
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-rose-300" />
        ) : (
          <PackageSearch size={15} className="mt-0.5 shrink-0 text-amber-300" />
        )}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-gray-400">{description}</p>
        </div>
      </div>
      {href && (
        <Link
          href={href}
          className="mt-3 inline-flex min-h-9 items-center justify-center gap-1 rounded-md border border-white/10 px-2 text-xs font-semibold text-gray-200 transition-colors hover:border-amber-500/40 hover:text-amber-200"
        >
          {actionLabel}
          <ArrowRight size={12} />
        </Link>
      )}
    </li>
  )
}

function BattleResultBadge({
  result,
  label,
}: {
  result: 'advantage' | 'disadvantage' | 'even' | 'unclear'
  label: string
}) {
  const className =
    result === 'advantage'
      ? 'bg-emerald-500/20 text-emerald-300'
      : result === 'disadvantage'
        ? 'bg-rose-500/20 text-rose-300'
        : result === 'even'
          ? 'bg-sky-500/20 text-sky-200'
          : 'bg-gray-800 text-gray-400'
  return <span className={`rounded px-2 py-0.5 font-bold ${className}`}>{label}</span>
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
          {leaders.map((leader, idx) => {
            const row = (
              <>
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
              </>
            )
            return (
              <li key={leader.key}>
                {leader.discord_id ? (
                  <Link
                    href={`/members/${leader.discord_id}`}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-800/70 transition-colors"
                  >
                    {row}
                  </Link>
                ) : (
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
                    {row}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

function AttendanceStatusBadge({
  status,
  label,
}: {
  status: 'confirmed_assigned' | 'assigned_no_battle' | 'unassigned_battle'
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
