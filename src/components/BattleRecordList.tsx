'use client'

import { Fragment, useState, useTransition, type MouseEvent } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle,
  Ban,
  ChevronDown,
  ChevronRight,
  CornerDownRight,
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
  GuildBattleListGroup,
  GuildBattleListMode,
  GuildBattleListRow,
  GuildBattleResultFilter,
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

export type BattleRecordRow = GuildBattleListRow
export type BattleListTab = GuildBattleListMode

const MODES: GuildBattleListMode[] = ['default', 'direct', 'alliance', 'excluded', 'diffs']
const RESULTS: GuildBattleResultFilter[] = ['advantage', 'disadvantage', 'even', 'unclear']

interface Props {
  groups: GuildBattleListGroup[]
  timezone: string
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
  statusLabels: Record<BattleProjectionStatus, string>
  evidenceLabels: Record<BattleProjectionEvidenceSource, string>
  opponentKindLabels: Record<'alliance' | 'guild', string>
  sameBattleLabel: string
  matchupLabel: string
  expandMatchupsLabel: string
  collapseMatchupsLabel: string
  diffLabel: string
  ledgerOnlyLabel: string
  columnLabels: {
    startedAt: string
    scope: string
    opponent: string
    result: string
    kdfame: string
    cluster: string
  }
}

function formatFame(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatOpponentNames(names: ReadonlyArray<string>): string {
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

export default function BattleRecordList({
  groups,
  timezone,
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
  statusLabels,
  evidenceLabels,
  opponentKindLabels,
  sameBattleLabel,
  matchupLabel,
  expandMatchupsLabel,
  collapseMatchupsLabel,
  diffLabel,
  ledgerOnlyLabel,
  columnLabels,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())
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

  const toggleGroup = (key: string) => {
    setExpandedGroups((current) => {
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

      {groups.length === 0 ? (
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-sm">{emptyLabel}</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-gray-900 border border-gray-700 rounded-xl">
          <table className="w-full text-base">
            <thead className="bg-gray-950/60 text-gray-400 text-sm">
              <tr>
                <th className="text-left px-3 py-2">{columnLabels.startedAt}</th>
                <th className="text-left px-3 py-2">{columnLabels.scope}</th>
                <th className="text-left px-3 py-2">{columnLabels.opponent}</th>
                <th className="text-left px-3 py-2">{columnLabels.result}</th>
                <th className="text-right px-3 py-2">{columnLabels.kdfame}</th>
                <th className="text-left px-3 py-2">{columnLabels.cluster}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const isExpanded = expandedGroups.has(group.key)
                return (
                  <Fragment key={group.key}>
                    <BattleGroupRow
                      group={group}
                      isExpanded={isExpanded}
                      timezone={timezone}
                      sizeLabel={group.sizeCategory ? sizeLabels[group.sizeCategory] : null}
                      relationLabel={relationLabels[group.relationScope]}
                      policyLabel={policyLabels[group.viewPolicy]}
                      resultLabel={resultLabels[group.resultEstimate]}
                      statusLabel={statusLabels[group.status]}
                      evidenceLabel={evidenceLabels[group.evidenceSource]}
                      activityLabel={activityLabels[group.activityKind]}
                      activitySourceLabel={activitySourceLabels[group.activitySource]}
                      canManageActivityOverrides={canManageActivityOverrides}
                      overrideLabels={activityOverrideLabels}
                      isOverridePending={isOverridePending}
                      onOverride={applyActivityOverride}
                      matchupLabel={matchupLabel}
                      expandMatchupsLabel={expandMatchupsLabel}
                      collapseMatchupsLabel={collapseMatchupsLabel}
                      diffLabel={diffLabel}
                      ledgerOnlyLabel={ledgerOnlyLabel}
                      onToggle={toggleGroup}
                      router={router}
                    />
                    {isExpanded &&
                      group.rows.map((row) => (
                        <BattleMatchupRow
                          key={row.id}
                          row={row}
                          sizeLabel={row.sizeCategory ? sizeLabels[row.sizeCategory] : null}
                          relationLabel={relationLabels[row.relationScope]}
                          policyLabel={policyLabels[row.viewPolicy]}
                          resultLabel={resultLabels[row.resultEstimate]}
                          statusLabel={statusLabels[row.status]}
                          evidenceLabel={evidenceLabels[row.evidenceSource]}
                          activityLabel={activityLabels[row.activityKind]}
                          activitySourceLabel={activitySourceLabels[row.activitySource]}
                          opponentKindLabel={opponentKindLabels[row.opponentForceKind]}
                          sameBattleLabel={sameBattleLabel}
                          diffLabel={diffLabel}
                          ledgerOnlyLabel={ledgerOnlyLabel}
                          router={router}
                        />
                      ))}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function resultTone(result: BattleResultEstimate): {
  className: string
  Icon: typeof Trophy
} {
  if (result === 'advantage') return { className: 'text-emerald-400', Icon: Trophy }
  if (result === 'disadvantage') return { className: 'text-red-400', Icon: Skull }
  if (result === 'even') return { className: 'text-gray-400', Icon: Minus }
  return { className: 'text-amber-300', Icon: Hourglass }
}

function relationTone(scope: BattleRelationScope): string {
  return scope === 'direct'
    ? 'border-amber-500/35 bg-amber-500/10 text-amber-200'
    : 'border-sky-500/35 bg-sky-500/10 text-sky-200'
}

interface BattleGroupRowProps {
  group: GuildBattleListGroup
  isExpanded: boolean
  timezone: string
  sizeLabel: string | null
  relationLabel: string
  policyLabel: string
  resultLabel: string
  statusLabel: string
  evidenceLabel: string
  activityLabel: string
  activitySourceLabel: string
  canManageActivityOverrides: boolean
  overrideLabels: {
    markGanking: string
    markZvZ: string
    reset: string
    updating: string
  }
  isOverridePending: boolean
  onOverride: (
    battleRecordId: string,
    relationScope: BattleRelationScope,
    action: 'mark_ganking' | 'mark_zvz' | 'reset',
  ) => void
  matchupLabel: string
  expandMatchupsLabel: string
  collapseMatchupsLabel: string
  diffLabel: string
  ledgerOnlyLabel: string
  onToggle: (key: string) => void
  router: ReturnType<typeof useRouter>
}

function BattleGroupRow({
  group,
  isExpanded,
  timezone,
  sizeLabel,
  relationLabel,
  policyLabel,
  resultLabel,
  statusLabel,
  evidenceLabel,
  activityLabel,
  activitySourceLabel,
  canManageActivityOverrides,
  overrideLabels,
  isOverridePending,
  onOverride,
  matchupLabel,
  expandMatchupsLabel,
  collapseMatchupsLabel,
  diffLabel,
  ledgerOnlyLabel,
  onToggle,
  router,
}: BattleGroupRowProps) {
  const { className: resultClassName, Icon: ResultIcon } = resultTone(group.resultEstimate)
  const href = `/battles/${group.id}`
  const hasSplitMatchups = group.matchupCount > 1
  const rowClass = hasSplitMatchups
    ? 'cursor-pointer hover:bg-gray-800/50 border-t border-gray-800 border-l-2 border-l-violet-500/45 bg-violet-500/[0.035]'
    : 'border-t border-gray-800 hover:bg-gray-800/40 cursor-pointer'

  return (
    <tr onClick={() => router.push(href)} className={rowClass}>
      <td className="px-3 py-2 text-gray-300 font-mono text-sm whitespace-nowrap">
        <div className="flex items-center gap-2">
          {hasSplitMatchups ? (
            <button
              type="button"
              aria-label={isExpanded ? collapseMatchupsLabel : expandMatchupsLabel}
              aria-expanded={isExpanded}
              onClick={(event) => {
                event.stopPropagation()
                onToggle(group.key)
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
            >
              {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
          ) : (
            <span className="h-7 w-7" aria-hidden />
          )}
          <Link
            href={href}
            onClick={(event) => event.stopPropagation()}
            className="hover:text-white"
          >
            {formatDateTimeShort(group.startedAt, timezone)}
          </Link>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <span
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${relationTone(
              group.relationScope,
            )}`}
          >
            {group.relationScope === 'direct' ? <Shield size={12} /> : <EyeOff size={12} />}
            {relationLabel}
          </span>
          {group.viewPolicy === 'small_or_low_engagement' && (
            <span className="inline-flex items-center gap-1 rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-300">
              <AlertTriangle size={11} />
              {policyLabel}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 text-[11px] text-cyan-100">
            {activityLabel}
            {group.activitySource !== 'automatic' && (
              <span className="text-cyan-300/70">({activitySourceLabel})</span>
            )}
          </span>
          {group.hasActiveDiff && (
            <span className="inline-flex items-center gap-1 rounded border border-violet-500/35 bg-violet-500/10 px-1.5 py-0.5 text-[11px] text-violet-200">
              <GitBranch size={11} />
              {diffLabel}
            </span>
          )}
          {group.status !== 'final' && (
            <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300">
              <Hourglass size={11} />
              {statusLabel}
            </span>
          )}
          {group.hasLedgerOnlyRows && (
            <span className="rounded border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[11px] text-sky-200">
              {ledgerOnlyLabel}
            </span>
          )}
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
      </td>
      <td className="px-3 py-2">
        <div className="text-base text-white">
          {formatOpponentNames(group.opponentForceNames)}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
          {hasSplitMatchups && (
            <>
              <span className="text-violet-300">
                {group.matchupCount} {matchupLabel}
              </span>
              <span aria-hidden>|</span>
            </>
          )}
          {sizeLabel && (
            <>
              <span>{sizeLabel}</span>
              <span aria-hidden>|</span>
            </>
          )}
          <span className="font-mono">
            {group.subjectTeamSize}v{group.opponentTeamSize}
          </span>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className={`inline-flex items-center gap-1 text-sm font-semibold ${resultClassName}`}>
          <ResultIcon size={14} />
          {resultLabel}
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5">{evidenceLabel}</div>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <div className="text-sm text-gray-300 font-mono">
          <span className="text-emerald-400">{group.subjectKills}</span>
          <span className="text-gray-600">/</span>
          <span className="text-red-400">{group.subjectDeaths}</span>
        </div>
        <div className="text-xs text-gray-500 font-mono">
          {formatFame(group.subjectKillFame)} vs {formatFame(group.opponentKillFame)}
        </div>
      </td>
      <td className="px-3 py-2 text-gray-400 text-sm">{group.clusterName ?? '-'}</td>
    </tr>
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

interface BattleMatchupRowProps {
  row: GuildBattleListRow
  sizeLabel: string | null
  relationLabel: string
  policyLabel: string
  resultLabel: string
  statusLabel: string
  evidenceLabel: string
  activityLabel: string
  activitySourceLabel: string
  opponentKindLabel: string
  sameBattleLabel: string
  diffLabel: string
  ledgerOnlyLabel: string
  router: ReturnType<typeof useRouter>
}

function BattleMatchupRow({
  row,
  sizeLabel,
  relationLabel,
  policyLabel,
  resultLabel,
  statusLabel,
  evidenceLabel,
  activityLabel,
  activitySourceLabel,
  opponentKindLabel,
  sameBattleLabel,
  diffLabel,
  ledgerOnlyLabel,
  router,
}: BattleMatchupRowProps) {
  const { className: resultClassName, Icon: ResultIcon } = resultTone(row.resultEstimate)
  const href = `/battles/${row.id}`

  return (
    <tr
      onClick={() => router.push(href)}
      className="cursor-pointer border-t border-t-dashed border-violet-500/20 border-l-2 border-l-violet-500/45 bg-violet-500/[0.025] hover:bg-gray-800/40"
    >
      <td className="px-3 py-2 text-gray-300 font-mono text-sm whitespace-nowrap">
        <Link
          href={href}
          onClick={(event) => event.stopPropagation()}
          className="inline-flex items-center gap-1 text-violet-300 hover:text-violet-200"
          title={sameBattleLabel}
        >
          <CornerDownRight size={14} />
          <span className="text-xs uppercase font-semibold">{sameBattleLabel}</span>
        </Link>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <span
            className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold ${relationTone(
              row.relationScope,
            )}`}
          >
            {row.relationScope === 'direct' ? <Shield size={12} /> : <EyeOff size={12} />}
            {relationLabel}
          </span>
          {row.viewPolicy === 'small_or_low_engagement' && (
            <span className="inline-flex items-center gap-1 rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-[11px] text-gray-300">
              <AlertTriangle size={11} />
              {policyLabel}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded border border-cyan-500/25 bg-cyan-500/10 px-1.5 py-0.5 text-[11px] text-cyan-100">
            {activityLabel}
            {row.activitySource !== 'automatic' && (
              <span className="text-cyan-300/70">({activitySourceLabel})</span>
            )}
          </span>
          {row.hasActiveDiff && (
            <span className="inline-flex items-center gap-1 rounded border border-violet-500/35 bg-violet-500/10 px-1.5 py-0.5 text-[11px] text-violet-200">
              <GitBranch size={11} />
              {diffLabel}
            </span>
          )}
          {row.status !== 'final' && (
            <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] text-amber-300">
              <Hourglass size={11} />
              {statusLabel}
            </span>
          )}
          {!row.legacyTenantBattleRecordId && (
            <span className="rounded border border-sky-500/25 bg-sky-500/10 px-1.5 py-0.5 text-[11px] text-sky-200">
              {ledgerOnlyLabel}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="text-base text-white">{row.opponentForceName}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
          <span>{opponentKindLabel}</span>
          {sizeLabel && (
            <>
              <span aria-hidden>|</span>
              <span>{sizeLabel}</span>
            </>
          )}
          <span aria-hidden>|</span>
          <span className="font-mono">
            {row.subjectTeamSize}v{row.opponentTeamSize}
          </span>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className={`inline-flex items-center gap-1 text-sm font-semibold ${resultClassName}`}>
          <ResultIcon size={14} />
          {resultLabel}
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5">{evidenceLabel}</div>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <div className="text-sm text-gray-300 font-mono">
          <span className="text-emerald-400">{row.subjectKills}</span>
          <span className="text-gray-600">/</span>
          <span className="text-red-400">{row.subjectDeaths}</span>
        </div>
        <div className="text-xs text-gray-500 font-mono">
          {formatFame(row.subjectKillFame)} vs {formatFame(row.opponentKillFame)}
        </div>
      </td>
      <td className="px-3 py-2 text-gray-400 text-sm">{row.clusterName ?? '-'}</td>
    </tr>
  )
}
