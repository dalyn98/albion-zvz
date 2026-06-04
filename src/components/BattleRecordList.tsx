'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle,
  CornerDownRight,
  EyeOff,
  GitBranch,
  Hourglass,
  Minus,
  Shield,
  Skull,
  Trophy,
} from 'lucide-react'
import type {
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
import type { SizeCategory } from '@/lib/albion-battles'
import { formatDateTimeShort } from '@/lib/format-datetime'

export type BattleRecordRow = GuildBattleListRow
export type BattleListTab = GuildBattleListMode

const MODES: GuildBattleListMode[] = ['default', 'direct', 'alliance', 'excluded', 'diffs']
const RESULTS: GuildBattleResultFilter[] = ['advantage', 'disadvantage', 'even', 'unclear']

type GroupRole = 'single' | 'first' | 'continuation'

interface Props {
  rows: GuildBattleListRow[]
  timezone: string
  activeMode: GuildBattleListMode
  resultFilter: GuildBattleResultFilter | null
  emptyLabel: string
  filterResultLabel: string
  filterAllLabel: string
  modeLabels: Record<GuildBattleListMode, string>
  sizeLabels: Record<SizeCategory, string>
  relationLabels: Record<BattleRelationScope, string>
  policyLabels: Record<BattleViewPolicy, string>
  resultLabels: Record<BattleResultEstimate, string>
  statusLabels: Record<BattleProjectionStatus, string>
  evidenceLabels: Record<BattleProjectionEvidenceSource, string>
  opponentKindLabels: Record<'alliance' | 'guild', string>
  sameBattleLabel: string
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

function computeGroupRoles(rows: ReadonlyArray<GuildBattleListRow>): GroupRole[] {
  const counts = new Map<number, number>()
  for (const row of rows) {
    counts.set(row.albionBattleId, (counts.get(row.albionBattleId) ?? 0) + 1)
  }

  const seen = new Set<number>()
  return rows.map((row) => {
    const count = counts.get(row.albionBattleId) ?? 1
    if (count === 1) return 'single'
    if (seen.has(row.albionBattleId)) return 'continuation'
    seen.add(row.albionBattleId)
    return 'first'
  })
}

export default function BattleRecordList({
  rows,
  timezone,
  activeMode,
  resultFilter,
  emptyLabel,
  filterResultLabel,
  filterAllLabel,
  modeLabels,
  sizeLabels,
  relationLabels,
  policyLabels,
  resultLabels,
  statusLabels,
  evidenceLabels,
  opponentKindLabels,
  sameBattleLabel,
  diffLabel,
  ledgerOnlyLabel,
  columnLabels,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

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

  const groupRoles = computeGroupRoles(rows)

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

      {rows.length === 0 ? (
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
              {rows.map((row, index) => (
                <BattleRow
                  key={row.id}
                  row={row}
                  groupRole={groupRoles[index]}
                  timezone={timezone}
                  sizeLabel={row.sizeCategory ? sizeLabels[row.sizeCategory] : null}
                  relationLabel={relationLabels[row.relationScope]}
                  policyLabel={policyLabels[row.viewPolicy]}
                  resultLabel={resultLabels[row.resultEstimate]}
                  statusLabel={statusLabels[row.status]}
                  evidenceLabel={evidenceLabels[row.evidenceSource]}
                  opponentKindLabel={opponentKindLabels[row.opponentForceKind]}
                  sameBattleLabel={sameBattleLabel}
                  diffLabel={diffLabel}
                  ledgerOnlyLabel={ledgerOnlyLabel}
                  router={router}
                />
              ))}
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

interface BattleRowProps {
  row: GuildBattleListRow
  groupRole: GroupRole
  timezone: string
  sizeLabel: string | null
  relationLabel: string
  policyLabel: string
  resultLabel: string
  statusLabel: string
  evidenceLabel: string
  opponentKindLabel: string
  sameBattleLabel: string
  diffLabel: string
  ledgerOnlyLabel: string
  router: ReturnType<typeof useRouter>
}

function BattleRow({
  row,
  groupRole,
  timezone,
  sizeLabel,
  relationLabel,
  policyLabel,
  resultLabel,
  statusLabel,
  evidenceLabel,
  opponentKindLabel,
  sameBattleLabel,
  diffLabel,
  ledgerOnlyLabel,
  router,
}: BattleRowProps) {
  const { className: resultClassName, Icon: ResultIcon } = resultTone(row.resultEstimate)
  const isGrouped = groupRole !== 'single'
  const isContinuation = groupRole === 'continuation'
  const href = `/battles/${row.id}`
  const rowClass = isGrouped
    ? `cursor-pointer hover:bg-gray-800/40 border-l-2 border-l-violet-500/40 bg-violet-500/[0.03] ${
        isContinuation
          ? 'border-t border-t-dashed border-violet-500/20'
          : 'border-t border-gray-800'
      }`
    : 'border-t border-gray-800 hover:bg-gray-800/40 cursor-pointer'

  return (
    <tr onClick={() => router.push(href)} className={rowClass}>
      <td className="px-3 py-2 text-gray-300 font-mono text-sm whitespace-nowrap">
        {isContinuation ? (
          <Link
            href={href}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 text-violet-300 hover:text-violet-200"
            title={sameBattleLabel}
          >
            <CornerDownRight size={14} />
            <span className="text-xs uppercase font-semibold">{sameBattleLabel}</span>
          </Link>
        ) : (
          <Link
            href={href}
            onClick={(event) => event.stopPropagation()}
            className="hover:text-white"
          >
            {formatDateTimeShort(row.startedAt, timezone)}
          </Link>
        )}
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
