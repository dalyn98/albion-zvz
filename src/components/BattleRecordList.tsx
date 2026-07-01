'use client'

import { Fragment, useState, useTransition, type MouseEvent } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle,
  Ban,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  EyeOff,
  GitBranch,
  Hourglass,
  Minus,
  RotateCcw,
  Shield,
  Skull,
  Swords,
  Trophy,
} from 'lucide-react'
import { setBattleActivityOverride } from '@/app/actions/battles'
import type {
  GuildBattleDisplayResult,
  GuildBattleListGroup,
  GuildBattleListMode,
  GuildBattleResultFilter,
  GuildBattleSessionForceLine,
  GuildBattleSessionGroup,
} from '@/lib/guild-battle-view'
import type {
  BattleProjectionEvidenceSource,
  BattleProjectionStatus,
  BattleRelationScope,
  BattleResultEstimate,
  BattleViewPolicy,
} from '@/lib/battle-ledger-shadow'
import type {
  BattleActivityKind,
  BattleActivitySource,
} from '@/lib/battle-activity-classification'
import type { SizeCategory } from '@/lib/albion-battles'
import { formatDateTimeShort } from '@/lib/format-datetime'
import { SectionCard, ValueDisplay } from '@/components/ui-patterns'

const MODES: GuildBattleListMode[] = ['default', 'direct', 'alliance', 'excluded', 'diffs']
const RESULTS: GuildBattleResultFilter[] = ['advantage', 'disadvantage', 'even', 'unclear']
const MAX_VISIBLE_FORCE_LINES = 5

interface Props {
  sessions: GuildBattleSessionGroup[]
  timezone: string
  tenantSlug: string | null
  canManageActivityOverrides: boolean
  activeMode: GuildBattleListMode
  resultFilter: GuildBattleResultFilter | null
  emptyLabel: string
  filterResultLabel: string
  filterAllLabel: string
  modeLabels: Record<GuildBattleListMode, string>
  sizeLabels: Record<SizeCategory, string>
  relationLabels: Record<BattleRelationScope, string>
  policyLabels: Record<BattleViewPolicy, string>
  activityLabels: Record<BattleActivityKind, string>
  activitySourceLabels: Record<BattleActivitySource, string>
  activityOverrideLabels: {
    markGanking: string
    markZvZ: string
    reset: string
    updating: string
  }
  resultLabels: Record<BattleResultEstimate, string>
  displayResultLabels: Record<GuildBattleDisplayResult, string>
  statusLabels: Record<BattleProjectionStatus, string>
  evidenceLabels: Record<BattleProjectionEvidenceSource, string>
  opponentKindLabels: Record<'alliance' | 'guild', string>
  sameBattleLabel: string
  expandMatchupsLabel: string
  collapseMatchupsLabel: string
  diffLabel: string
  ledgerOnlyLabel: string
  battleSingularLabel: string
  battlePluralLabel: string
  detailsLabel: string
  shareLabel: string
  battleIdsLabel: string
  moreForcesLabel: string
  forceColumnLabels: {
    name: string
    players: string
    kills: string
    deaths: string
    fame: string
  }
  columnLabels: {
    startedAt: string
    scope: string
    opponent: string
    result: string
    kdfame: string
    cluster: string
  }
}

function formatInteger(value: number): string {
  return Math.max(0, Math.floor(value)).toLocaleString('en-US')
}

function formatFame(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatOpponentNames(names: ReadonlyArray<string>): string {
  if (names.length === 0) return '-'
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

function publicBattleGroupHref(
  session: GuildBattleSessionGroup,
  tenantSlug: string | null,
): string | null {
  if (!tenantSlug || session.battleIds.length === 0) return null
  const ids = session.battleIds.join(',')
  return `/g/${encodeURIComponent(tenantSlug)}/battles/multi?server=${session.albionServer}&ids=${ids}`
}

function resultTone(result: GuildBattleDisplayResult): {
  className: string
  Icon: typeof Trophy
} {
  if (result === 'advantage') return { className: 'text-emerald-400', Icon: Trophy }
  if (result === 'disadvantage') return { className: 'text-red-400', Icon: Skull }
  if (result === 'even') return { className: 'text-gray-400', Icon: Minus }
  if (result === 'mixed') return { className: 'text-violet-300', Icon: GitBranch }
  return { className: 'text-amber-300', Icon: Hourglass }
}

function relationTone(scope: BattleRelationScope): string {
  return scope === 'direct'
    ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
    : 'border-sky-500/35 bg-sky-500/10 text-sky-200'
}

function forceRowTone(force: GuildBattleSessionForceLine): string {
  if (force.highlighted) return 'bg-amber-400/10 text-amber-50'
  if (force.kills > force.deaths) return 'text-emerald-100'
  if (force.deaths > force.kills) return 'text-red-100'
  return 'text-gray-100'
}

export default function BattleRecordList({
  sessions,
  timezone,
  tenantSlug,
  canManageActivityOverrides,
  activeMode,
  resultFilter,
  emptyLabel,
  filterResultLabel,
  filterAllLabel,
  modeLabels,
  sizeLabels,
  relationLabels,
  policyLabels,
  activityLabels,
  activitySourceLabels,
  activityOverrideLabels,
  resultLabels,
  displayResultLabels,
  statusLabels,
  evidenceLabels,
  opponentKindLabels,
  sameBattleLabel,
  expandMatchupsLabel,
  collapseMatchupsLabel,
  diffLabel,
  ledgerOnlyLabel,
  battleSingularLabel,
  battlePluralLabel,
  detailsLabel,
  shareLabel,
  battleIdsLabel,
  moreForcesLabel,
  forceColumnLabels,
  columnLabels,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(() => new Set())
  const [isOverridePending, startOverrideTransition] = useTransition()
  const [overrideError, setOverrideError] = useState<string | null>(null)

  const selectMode = (next: GuildBattleListMode) => {
    if (next === activeMode) return
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'default') params.delete('view')
    else params.set('view', next)
    params.delete('tab')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const setResult = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (!value) params.delete('result')
    else params.set('result', value)
    params.delete('outcome')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const toggleSession = (key: string) => {
    setExpandedSessions((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const applyActivityOverride = (
    battleRecordId: string,
    relationScope: BattleRelationScope,
    action: 'mark_ganking' | 'mark_zvz' | 'reset',
  ) => {
    setOverrideError(null)
    startOverrideTransition(async () => {
      const result = await setBattleActivityOverride({
        battleRecordId,
        relationScope,
        action,
      })
      if (!result.ok) {
        setOverrideError(result.error ?? 'Failed to update battle classification')
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      <nav role="tablist" className="flex gap-1 border-b border-gray-800 overflow-x-auto">
        {MODES.map((mode) => {
          const isActive = activeMode === mode
          return (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectMode(mode)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                isActive
                  ? 'text-amber-300 border-amber-400'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              {modeLabels[mode]}
            </button>
          )
        })}
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-xs">{filterResultLabel}</label>
          <select
            value={resultFilter ?? ''}
            onChange={(event) => setResult(event.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500"
          >
            <option value="">{filterAllLabel}</option>
            {RESULTS.map((result) => (
              <option key={result} value={result}>
                {resultLabels[result]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {overrideError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {overrideError}
        </div>
      )}

      {sessions.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-12 text-center">
          <p className="text-gray-400 text-sm">{emptyLabel}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <BattleSessionCard
              key={session.key}
              session={session}
              timezone={timezone}
              tenantSlug={tenantSlug}
              isExpanded={expandedSessions.has(session.key)}
              onToggle={toggleSession}
              canManageActivityOverrides={canManageActivityOverrides}
              overrideLabels={activityOverrideLabels}
              isOverridePending={isOverridePending}
              onOverride={applyActivityOverride}
              sizeLabel={session.sizeCategory ? sizeLabels[session.sizeCategory] : null}
              relationLabel={relationLabels[session.relationScope]}
              policyLabel={policyLabels[session.viewPolicy]}
              activityLabel={activityLabels[session.activityKind]}
              activitySourceLabel={activitySourceLabels[session.activitySource]}
              resultLabel={displayResultLabels[session.displayResult]}
              statusLabel={statusLabels[session.status]}
              evidenceLabel={evidenceLabels[session.evidenceSource]}
              opponentKindLabels={opponentKindLabels}
              sameBattleLabel={sameBattleLabel}
              expandMatchupsLabel={expandMatchupsLabel}
              collapseMatchupsLabel={collapseMatchupsLabel}
              diffLabel={diffLabel}
              ledgerOnlyLabel={ledgerOnlyLabel}
              battleSingularLabel={battleSingularLabel}
              battlePluralLabel={battlePluralLabel}
              detailsLabel={detailsLabel}
              shareLabel={shareLabel}
              battleIdsLabel={battleIdsLabel}
              moreForcesLabel={moreForcesLabel}
              forceColumnLabels={forceColumnLabels}
              columnLabels={columnLabels}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface BattleSessionCardProps {
  session: GuildBattleSessionGroup
  timezone: string
  tenantSlug: string | null
  isExpanded: boolean
  onToggle: (key: string) => void
  canManageActivityOverrides: boolean
  overrideLabels: Props['activityOverrideLabels']
  isOverridePending: boolean
  onOverride: (
    battleRecordId: string,
    relationScope: BattleRelationScope,
    action: 'mark_ganking' | 'mark_zvz' | 'reset',
  ) => void
  sizeLabel: string | null
  relationLabel: string
  policyLabel: string
  activityLabel: string
  activitySourceLabel: string
  resultLabel: string
  statusLabel: string
  evidenceLabel: string
  opponentKindLabels: Props['opponentKindLabels']
  sameBattleLabel: string
  expandMatchupsLabel: string
  collapseMatchupsLabel: string
  diffLabel: string
  ledgerOnlyLabel: string
  battleSingularLabel: string
  battlePluralLabel: string
  detailsLabel: string
  shareLabel: string
  battleIdsLabel: string
  moreForcesLabel: string
  forceColumnLabels: Props['forceColumnLabels']
  columnLabels: Props['columnLabels']
}

function BattleSessionCard({
  session,
  timezone,
  tenantSlug,
  isExpanded,
  onToggle,
  canManageActivityOverrides,
  overrideLabels,
  isOverridePending,
  onOverride,
  sizeLabel,
  relationLabel,
  policyLabel,
  activityLabel,
  activitySourceLabel,
  resultLabel,
  statusLabel,
  evidenceLabel,
  opponentKindLabels,
  sameBattleLabel,
  expandMatchupsLabel,
  collapseMatchupsLabel,
  diffLabel,
  ledgerOnlyLabel,
  battleSingularLabel,
  battlePluralLabel,
  detailsLabel,
  shareLabel,
  battleIdsLabel,
  moreForcesLabel,
  forceColumnLabels,
  columnLabels,
}: BattleSessionCardProps) {
  const { className: resultClassName, Icon: ResultIcon } = resultTone(session.displayResult)
  const shareHref = publicBattleGroupHref(session, tenantSlug)
  const visibleForces = session.forceLines.slice(0, MAX_VISIBLE_FORCE_LINES)
  const hiddenForceCount = Math.max(0, session.forceLines.length - visibleForces.length)
  const battleCountLabel =
    session.battleCount === 1 ? battleSingularLabel : battlePluralLabel
  const hasExpandedRows = session.groups.length > 1 || session.matchupCount > 1

  return (
    <SectionCard className="overflow-hidden p-0 sm:p-0">
      <div className="space-y-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
              <span className="font-mono text-amber-200">
                {formatDateTimeShort(session.startedAt, timezone)}
              </span>
              <span className="text-gray-600">-</span>
              <span className="font-mono">{formatDateTimeShort(session.endedAt, timezone)}</span>
              <span className="text-gray-600">|</span>
              <span className="uppercase">{session.albionServer}</span>
              <span className="text-gray-600">|</span>
              <span>
                {session.battleCount} {battleCountLabel}
              </span>
            </div>
            <Link
              href={`/battles/${session.id}`}
              className="block text-lg font-bold text-white hover:text-amber-200"
            >
              {session.subjectName} vs {formatOpponentNames(session.opponentForceNames)}
            </Link>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
              {sizeLabel && <span>{sizeLabel}</span>}
              <span>
                {session.subjectTeamSize}v{session.opponentTeamSize}
              </span>
              <span>
                {battleIdsLabel} {session.battleIds.join(', ')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:min-w-[260px]">
            <SummaryPill
              label={columnLabels.result}
              value={resultLabel}
              className={resultClassName}
              icon={<ResultIcon size={13} />}
            />
            <SummaryPill
              label="K/D"
              value={`${formatInteger(session.subjectKills)}/${formatInteger(session.subjectDeaths)}`}
              className="text-gray-100"
            />
            <SummaryPill
              label={forceColumnLabels.fame}
              value={formatFame(session.subjectKillFame)}
              className="text-amber-200"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${relationTone(
              session.relationScope,
            )}`}
          >
            {session.relationScope === 'direct' ? <Shield size={12} /> : <EyeOff size={12} />}
            {relationLabel}
          </span>
          {session.viewPolicy === 'small_or_low_engagement' && (
            <span className="inline-flex items-center gap-1 rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-300">
              <AlertTriangle size={11} />
              {policyLabel}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 text-[11px] text-cyan-100">
            {activityLabel}
            {session.activitySource !== 'automatic' && (
              <span className="text-cyan-300/70">({activitySourceLabel})</span>
            )}
          </span>
          {session.hasActiveDiff && (
            <span className="inline-flex items-center gap-1 rounded border border-violet-500/35 bg-violet-500/10 px-1.5 py-0.5 text-[11px] text-violet-200">
              <GitBranch size={11} />
              {diffLabel}
            </span>
          )}
          {session.status !== 'final' && (
            <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300">
              <Hourglass size={11} />
              {statusLabel}
            </span>
          )}
          {session.hasLedgerOnlyRows && (
            <span className="rounded border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[11px] text-sky-200">
              {ledgerOnlyLabel}
            </span>
          )}
          <span className="text-[11px] text-gray-500">{evidenceLabel}</span>
        </div>

        <ForceBoard
          forces={visibleForces}
          hiddenForceCount={hiddenForceCount}
          labels={forceColumnLabels}
          moreForcesLabel={moreForcesLabel}
        />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-800 pt-3">
          <button
            type="button"
            onClick={() => onToggle(session.key)}
            className="inline-flex items-center gap-1 rounded border border-gray-700 bg-gray-950 px-2.5 py-1.5 text-xs font-semibold text-gray-200 hover:border-violet-400/50 hover:text-violet-100 disabled:cursor-default disabled:opacity-50"
            disabled={!hasExpandedRows}
            aria-expanded={isExpanded}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>{isExpanded ? collapseMatchupsLabel : expandMatchupsLabel}</span>
            <span className="font-mono tabular-nums text-gray-400">
              ({session.matchupCount})
            </span>
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/battles/${session.id}`}
              className="inline-flex items-center gap-1 rounded border border-gray-700 bg-gray-950 px-2.5 py-1.5 text-xs font-semibold text-gray-200 hover:border-amber-400/50 hover:text-amber-100"
            >
              <Swords size={13} />
              {detailsLabel}
            </Link>
            {shareHref && (
              <Link
                href={shareHref}
                className="inline-flex items-center gap-1 rounded border border-gray-700 bg-gray-950 px-2.5 py-1.5 text-xs font-semibold text-gray-200 hover:border-sky-400/50 hover:text-sky-100"
              >
                <ExternalLink size={13} />
                {shareLabel}
              </Link>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border bg-surface-2/40 px-4 py-3">
          <div className="space-y-2">
            {session.groups.map((group) => (
              <ExpandedBattleGroup
                key={group.key}
                group={group}
                timezone={timezone}
                canManageActivityOverrides={canManageActivityOverrides}
                overrideLabels={overrideLabels}
                isOverridePending={isOverridePending}
                onOverride={onOverride}
                sizeLabel={group.sizeCategory ? sizeLabel : null}
                opponentKindLabels={opponentKindLabels}
                sameBattleLabel={sameBattleLabel}
              />
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  )
}

function SummaryPill({
  label,
  value,
  className,
  icon,
}: {
  label: string
  value: string
  className: string
  icon?: React.ReactNode
}) {
  return (
    <div className="rounded border border-border bg-surface-2/70 px-2 py-2">
      <ValueDisplay
        iconNode={icon}
        label={label}
        value={value}
        size="sm"
        valueClassName={className}
        iconClassName={className}
      />
    </div>
  )
}

function ForceBoard({
  forces,
  hiddenForceCount,
  labels,
  moreForcesLabel,
}: {
  forces: GuildBattleSessionForceLine[]
  hiddenForceCount: number
  labels: Props['forceColumnLabels']
  moreForcesLabel: string
}) {
  return (
    <div className="overflow-x-auto rounded border border-border bg-surface-2/70">
      <div className="min-w-[520px]">
        <div className="grid grid-cols-[minmax(0,1fr)_72px_56px_56px_84px] gap-2 border-b border-border px-3 py-2 text-[11px] font-semibold uppercase text-muted">
          <span>{labels.name}</span>
          <span className="text-right">{labels.players}</span>
          <span className="text-right">{labels.kills}</span>
          <span className="text-right">{labels.deaths}</span>
          <span className="text-right">{labels.fame}</span>
        </div>
        <div className="divide-y divide-border">
          {forces.map((force) => (
            <div
              key={force.key}
              className={`grid grid-cols-[minmax(0,1fr)_72px_56px_56px_84px] gap-2 px-3 py-2 text-sm ${forceRowTone(force)}`}
            >
              <div className="min-w-0 truncate font-semibold">
                {force.highlighted && (
                  <Shield size={12} className="mr-1 inline-block align-[-1px] text-amber-300" />
                )}
                {force.name}
              </div>
              <div className="text-right font-mono text-sky-200">
                {formatInteger(force.teamSize)}
              </div>
              <div className="text-right font-mono text-emerald-300">
                {formatInteger(force.kills)}
              </div>
              <div className="text-right font-mono text-red-300">
                {formatInteger(force.deaths)}
              </div>
              <div className="text-right font-mono text-amber-200">
                {formatFame(force.killFame)}
              </div>
            </div>
          ))}
          {hiddenForceCount > 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">
              +{hiddenForceCount} {moreForcesLabel}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ExpandedBattleGroup({
  group,
  timezone,
  canManageActivityOverrides,
  overrideLabels,
  isOverridePending,
  onOverride,
  sizeLabel,
  opponentKindLabels,
  sameBattleLabel,
}: {
  group: GuildBattleListGroup
  timezone: string
  canManageActivityOverrides: boolean
  overrideLabels: Props['activityOverrideLabels']
  isOverridePending: boolean
  onOverride: (
    battleRecordId: string,
    relationScope: BattleRelationScope,
    action: 'mark_ganking' | 'mark_zvz' | 'reset',
  ) => void
  sizeLabel: string | null
  opponentKindLabels: Props['opponentKindLabels']
  sameBattleLabel: string
}) {
  return (
    <div className="rounded border border-gray-800 bg-gray-900/80 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/battles/${group.id}`}
          className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-100 hover:text-amber-200"
        >
          <span className="font-mono text-xs text-amber-200">
            {formatDateTimeShort(group.startedAt, timezone)}
          </span>
          <span className="truncate">{formatOpponentNames(group.opponentForceNames)}</span>
        </Link>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{group.albionBattleId}</span>
          {sizeLabel && <span>{sizeLabel}</span>}
          <span>
            {group.subjectKills}/{group.subjectDeaths} · {formatFame(group.subjectKillFame)}
          </span>
          {canManageActivityOverrides && group.relationScope === 'direct' && (
            <ActivityOverrideButtons
              battleRecordId={group.battleRecordId}
              relationScope={group.relationScope}
              labels={overrideLabels}
              disabled={isOverridePending}
              onOverride={onOverride}
            />
          )}
        </div>
      </div>
      {group.rows.length > 1 && (
        <div className="mt-2 space-y-1 border-t border-gray-800 pt-2">
          {group.rows.map((row) => (
            <Fragment key={row.id}>
              <Link
                href={`/battles/${row.id}`}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-800/70 hover:text-gray-100"
                title={sameBattleLabel}
              >
                <span className="font-mono text-violet-300">{row.matchIndex}/{row.matchTotal}</span>
                <span className="min-w-0 truncate">
                  {row.opponentForceName} · {opponentKindLabels[row.opponentForceKind]}
                </span>
                <span className="font-mono">
                  {row.subjectKills}/{row.subjectDeaths} · {formatFame(row.subjectKillFame)}
                </span>
              </Link>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}

interface ActivityOverrideButtonsProps {
  battleRecordId: string
  relationScope: BattleRelationScope
  labels: {
    markGanking: string
    markZvZ: string
    reset: string
    updating: string
  }
  disabled: boolean
  onOverride: (
    battleRecordId: string,
    relationScope: BattleRelationScope,
    action: 'mark_ganking' | 'mark_zvz' | 'reset',
  ) => void
}

function ActivityOverrideButtons({
  battleRecordId,
  relationScope,
  labels,
  disabled,
  onOverride,
}: ActivityOverrideButtonsProps) {
  const buttonClass =
    'inline-flex h-6 w-6 items-center justify-center rounded border border-gray-600 bg-gray-900 text-gray-300 hover:border-amber-500/60 hover:text-amber-200 disabled:cursor-wait disabled:opacity-60'

  const handleClick = (
    event: MouseEvent<HTMLButtonElement>,
    action: 'mark_ganking' | 'mark_zvz' | 'reset',
  ) => {
    event.stopPropagation()
    onOverride(battleRecordId, relationScope, action)
  }

  return (
    <span className="inline-flex items-center gap-1 rounded border border-gray-700 bg-gray-950/80 px-1 py-0.5">
      <button
        type="button"
        className={buttonClass}
        disabled={disabled}
        title={disabled ? labels.updating : labels.markGanking}
        aria-label={labels.markGanking}
        onClick={(event) => handleClick(event, 'mark_ganking')}
      >
        <Ban size={12} />
      </button>
      <button
        type="button"
        className={buttonClass}
        disabled={disabled}
        title={disabled ? labels.updating : labels.markZvZ}
        aria-label={labels.markZvZ}
        onClick={(event) => handleClick(event, 'mark_zvz')}
      >
        <Swords size={12} />
      </button>
      <button
        type="button"
        className={buttonClass}
        disabled={disabled}
        title={disabled ? labels.updating : labels.reset}
        aria-label={labels.reset}
        onClick={(event) => handleClick(event, 'reset')}
      >
        <RotateCcw size={12} />
      </button>
    </span>
  )
}
