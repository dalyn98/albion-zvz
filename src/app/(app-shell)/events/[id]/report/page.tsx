import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Users,
  Banknote,
  Swords,
  Clock,
  CircleMinus,
  AlertTriangle,
  ClipboardCheck,
  PackageSearch,
  BookOpen,
  Hammer,
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
import { getEventTacticSnapshotSummary } from '@/lib/event-operations-server'
import { sessionCanViewTactics } from '@/lib/tactics/access'
import ItemImage from '@/components/ItemImage'
import { getLocale } from '@/lib/locale'
import { getLocalizedItemNameWithEnchant } from '@/lib/item-names'
import EventParticipationCloseoutPanel from '@/components/EventParticipationCloseoutPanel'
import { isTacticsExperimentalEnabled } from '@/lib/tactics/feature-server'

export const dynamic = 'force-dynamic'

export default async function EventReportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getSession()
  if (!session) {
    redirect(`/login?returnTo=${encodeURIComponent(`/events/${id}/report`)}`)
  }

  const guildId = await getSessionGuildId(session)
  const [result, t, tRole, tOperations, tenantTimezone, locale] = await Promise.all([
    getEventReport(id),
    getTranslations('eventReport'),
    getTranslations('slotRole'),
    getTranslations('eventOperations'),
    getTenantTimezone(guildId),
    getLocale(),
  ])
  if (!result) notFound()
  const { event, report, operations } = result
  const canOpenBattleRecords =
    !session.isGuest &&
    !session.isLocalGuildAccount &&
    (session.isAdmin || session.isMember)
  const canViewTactic =
    sessionCanViewTactics(session) &&
    await isTacticsExperimentalEnabled(guildId)
  const tacticSnapshot = canViewTactic
    ? await getEventTacticSnapshotSummary(guildId, id)
    : null
  const battleRequired = report.attendance.linkedBattleCount > 0
  const closeout = resolveEventCloseout({
    battleRequired,
    linkedBattleCount: report.attendance.linkedBattleCount,
    pendingRegearCount: report.regear.pendingCount,
    lootAuditRequired: operations.lootAuditRequired,
    lootAuditSettled: operations.lootAuditSettled === true,
  })
  const latestLootAudit = operations.lootAudits[0]
  const craftDemand = operations.craftDemand
  const hasCraftWorkflow = !!craftDemand &&
    craftDemand.queuedCount + craftDemand.claimedCount + craftDemand.deliveredCount > 0

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

      {tacticSnapshot && canViewTactic && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/25 bg-sky-500/[0.05] p-4">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-bold text-white">
              <BookOpen size={15} className="text-sky-300" />
              {tOperations('snapshotBadge')}
            </h2>
            <p className="mt-1 text-xs text-gray-400">
              {tacticSnapshot.title} · {tOperations('capturedAt', {
                date: formatDateTimeShort(tacticSnapshot.capturedAt, tenantTimezone),
              })}
            </p>
          </div>
          <Link
            href={`/events/${id}/tactic`}
            className="inline-flex items-center gap-1 rounded-lg border border-sky-500/35 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/10"
          >
            {tOperations('viewSnapshot')}
            <ArrowRight size={13} />
          </Link>
        </section>
      )}

      {operations.canFinalizeParticipation &&
        operations.participationCloseout && (
          <EventParticipationCloseoutPanel
            eventId={event.id}
            state={operations.participationCloseout}
          />
        )}

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

      {hasCraftWorkflow && craftDemand && (
        <section className="rounded-xl border border-violet-500/25 bg-violet-500/[0.05] p-4 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-white">
                <Hammer size={15} className="text-violet-300" />
                {t('craftDemandTitle')}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-gray-400">
                {t('craftDemandDescription')}
              </p>
            </div>
            <Link
              href={`/craft/queue?event=${event.id}`}
              className="inline-flex items-center gap-1 rounded-lg border border-violet-500/35 px-3 py-2 text-xs font-bold text-violet-200 hover:bg-violet-500/10"
            >
              {t('craftDemandOpenQueue')}
              <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <CompactMetric label={t('craftDemandQueued')} value={craftDemand.queuedCount} />
            <CompactMetric label={t('craftDemandClaimed')} value={craftDemand.claimedCount} />
            <CompactMetric label={t('craftDemandDelivered')} value={craftDemand.deliveredCount} />
            <CompactMetric
              label={t('craftDemandShortage')}
              value={craftDemand.totalShortageUnits}
              warning={craftDemand.totalShortageUnits > 0}
            />
          </div>
          {craftDemand.shortageItemCount > 0 ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {craftDemand.items.filter((item) => item.shortage > 0).slice(0, 8).map((item) => (
                <li
                  key={item.itemId}
                  className="flex items-center gap-2 rounded-lg border border-gray-800 bg-gray-950/60 p-2"
                >
                  <ItemImage itemId={item.itemId} itemName={item.itemName} size={32} hoverPreview />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-gray-200">
                      {getLocalizedItemNameWithEnchant(item.itemId, locale, item.itemName) ?? item.itemId}
                    </p>
                    <p className="mt-0.5 text-[10px] text-gray-500">
                      {t('craftDemandItemCounts', {
                        needed: item.needed,
                        stock: item.stock,
                        shortage: item.shortage,
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 rounded bg-rose-500/15 px-2 py-1 font-mono text-xs font-bold text-rose-300">
                    -{item.shortage}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/[0.07] px-3 py-2 text-xs text-emerald-200">
              {t('craftDemandCovered')}
            </p>
          )}
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
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-6 font-mono text-gray-500">#{b.battle_number}</span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-gray-200">
                          {b.opponent_force_name}
                        </span>
                        <span className="mt-0.5 block font-mono text-[10px] text-gray-500">
                          {t('battleRecordId', { id: b.albion_battle_id })}
                        </span>
                      </span>
                    </div>
                    {canOpenBattleRecords && (
                      <ChevronRight size={14} className="flex-shrink-0 text-gray-600" />
                    )}
                  </div>
                  <div className="rounded-md border border-white/[0.06] bg-black/20 px-2.5 py-2">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
                      {t('battleWhyLinked')}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <ExplainabilityBadge label={t(`battleStatus.${b.projection_status}`)} />
                      <ExplainabilityBadge label={t(`battleEvidence.${b.evidence_source}`)} />
                      <ExplainabilityBadge label={t(`battleActivity.${b.activity_kind}`)} />
                      <ExplainabilityBadge label={t(`battleSource.${b.activity_source}`)} />
                      <ExplainabilityBadge label={t(`battlePolicy.${b.view_policy}`)} />
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-gray-400">
                      {t(`battleReason.${battleReasonKey(b.activity_reason)}`)}
                    </p>
                  </div>
                </div>
              )
              return (
                <li key={b.id}>
                  {canOpenBattleRecords ? (
                    <Link
                      href={`/battles/${b.id}?event=${event.id}&fromEvent=${event.id}#killbot-event-${event.id}`}
                      className="block rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-xs transition-colors hover:border-gray-700 hover:bg-gray-800/60"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="rounded-lg border border-gray-800 bg-gray-950/60 px-3 py-2 text-xs">
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

      <section className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
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
                className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 items-center"
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

type BattleReasonKey =
  | 'zvzScale'
  | 'shortOneSided'
  | 'fragmentedOpposition'
  | 'oneSidedCatch'
  | 'mutualSmallscale'
  | 'lowEngagement'
  | 'meaningfulSmallscale'
  | 'gankingEvent'
  | 'manualZvZ'
  | 'manualGanking'
  | 'manualOverride'
  | 'legacy'
  | 'unknown'

function battleReasonKey(reason: string): BattleReasonKey {
  switch (reason) {
    case 'disarray_scale_mutual_or_sustained':
      return 'zvzScale'
    case 'disarray_scale_short_one_sided':
      return 'shortOneSided'
    case 'zerg_party_vs_fragmented_opposition':
      return 'fragmentedOpposition'
    case 'large_party_one_sided_catch':
      return 'oneSidedCatch'
    case 'large_party_mutual_below_zvz_threshold':
      return 'mutualSmallscale'
    case 'low_engagement_or_force_floor':
      return 'lowEngagement'
    case 'meaningful_smallscale':
      return 'meaningfulSmallscale'
    case 'ganking_event_window':
      return 'gankingEvent'
    case 'manual_mark_zvz':
      return 'manualZvZ'
    case 'manual_mark_ganking':
      return 'manualGanking'
    case 'manual_override':
      return 'manualOverride'
    case 'legacy_backfill':
      return 'legacy'
    default:
      return 'unknown'
  }
}

function ExplainabilityBadge({ label }: { label: string }) {
  return (
    <span className="rounded border border-gray-700 bg-gray-900 px-1.5 py-0.5 text-[10px] font-semibold text-gray-300">
      {label}
    </span>
  )
}

function CompactMetric({
  label,
  value,
  warning = false,
}: {
  label: string
  value: number
  warning?: boolean
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
      <p className="text-[10px] font-semibold text-gray-500">{label}</p>
      <p className={`mt-0.5 font-mono text-lg font-bold ${warning ? 'text-rose-300' : 'text-white'}`}>
        {value.toLocaleString()}
      </p>
    </div>
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
