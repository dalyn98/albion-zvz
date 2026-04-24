'use client'

// 전투기록 목록 — 서버 컴포넌트가 조회한 행을 받아 필터 드롭다운 + 테이블 렌더.
// 필터는 searchParams(size, outcome) 로 서버 왕복 → RSC 재조회.

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Trophy, Skull, Minus } from 'lucide-react'
import type { SizeCategory } from '@/lib/albion-battles'

export interface BattleRecordRow {
  id: string
  albionBattleId: number
  clusterName: string | null
  startedAt: string
  homeGuildName: string
  homeAllianceName: string | null
  homeTeamSize: number
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  opponentTeamSize: number
  opponentKills: number
  opponentDeaths: number
  opponentKillFame: number
  opponentGuildNames: string[]
  opponentAllianceNames: string[]
  primaryOpponentName: string | null
  sizeCategory: SizeCategory
  outcome: 'win' | 'loss' | 'tie'
}

interface Props {
  rows: BattleRecordRow[]
  sizeFilter: SizeCategory | null
  outcomeFilter: 'win' | 'loss' | 'tie' | null
  emptyLabel: string
  filterSizeLabel: string
  filterOutcomeLabel: string
  filterAllLabel: string
  sizeLabels: Record<SizeCategory, string>
  outcomeLabels: Record<'win' | 'loss' | 'tie', string>
  columnLabels: {
    startedAt: string
    size: string
    outcome: string
    opponent: string
    kdfame: string
    cluster: string
  }
}

const SIZES: SizeCategory[] = ['small', 'middle', 'large', 'zerg']
const OUTCOMES: Array<'win' | 'loss' | 'tie'> = ['win', 'loss', 'tie']

function formatFame(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatStartedAt(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d)
}

export default function BattleRecordList({
  rows,
  sizeFilter,
  outcomeFilter,
  emptyLabel,
  filterSizeLabel,
  filterOutcomeLabel,
  filterAllLabel,
  sizeLabels,
  outcomeLabels,
  columnLabels,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const setParam = (key: 'size' | 'outcome', value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (!value) params.delete(key)
    else params.set(key, value)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-xs">{filterSizeLabel}</label>
          <select
            value={sizeFilter ?? ''}
            onChange={(e) => setParam('size', e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500"
          >
            <option value="">{filterAllLabel}</option>
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {sizeLabels[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-xs">{filterOutcomeLabel}</label>
          <select
            value={outcomeFilter ?? ''}
            onChange={(e) => setParam('outcome', e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-amber-500"
          >
            <option value="">{filterAllLabel}</option>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {outcomeLabels[o]}
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
          <table className="w-full text-sm">
            <thead className="bg-gray-950/60 text-gray-400 text-xs">
              <tr>
                <th className="text-left px-3 py-2">{columnLabels.startedAt}</th>
                <th className="text-left px-3 py-2">{columnLabels.size}</th>
                <th className="text-left px-3 py-2">{columnLabels.outcome}</th>
                <th className="text-left px-3 py-2">{columnLabels.opponent}</th>
                <th className="text-right px-3 py-2">{columnLabels.kdfame}</th>
                <th className="text-left px-3 py-2">{columnLabels.cluster}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <BattleRow
                  key={row.id}
                  row={row}
                  sizeLabel={sizeLabels[row.sizeCategory]}
                  outcomeLabel={outcomeLabels[row.outcome]}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

interface BattleRowProps {
  row: BattleRecordRow
  sizeLabel: string
  outcomeLabel: string
}

function BattleRow({ row, sizeLabel, outcomeLabel }: BattleRowProps) {
  const outcomeColor =
    row.outcome === 'win'
      ? 'text-emerald-400'
      : row.outcome === 'loss'
        ? 'text-red-400'
        : 'text-gray-400'
  const OutcomeIcon =
    row.outcome === 'win' ? Trophy : row.outcome === 'loss' ? Skull : Minus

  const opponentLabel =
    row.primaryOpponentName ??
    row.opponentGuildNames[0] ??
    row.opponentAllianceNames[0] ??
    '-'
  const extraGuildCount =
    row.opponentGuildNames.length > 1 ? row.opponentGuildNames.length - 1 : 0
  // 연합 라벨: primary_opponent_name 이 이미 alliance 와 일치하면 중복 노출 생략.
  // 여러 alliance 가 섞였으면 ", " 로 붙여 컴팩트하게. 없으면 null.
  const allianceLabel =
    row.opponentAllianceNames.length > 0 &&
    !(row.opponentAllianceNames.length === 1 && row.opponentAllianceNames[0] === opponentLabel)
      ? row.opponentAllianceNames.join(', ')
      : null

  return (
    <tr className="border-t border-gray-800 hover:bg-gray-800/40">
      <td className="px-3 py-2 text-gray-300 font-mono text-xs whitespace-nowrap">
        {formatStartedAt(row.startedAt)}
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-1 bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-[11px] text-gray-300">
          {sizeLabel}
          <span className="text-gray-500">
            {row.homeTeamSize}v{row.opponentTeamSize}
          </span>
        </span>
      </td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center gap-1 text-xs font-semibold ${outcomeColor}`}>
          <OutcomeIcon size={12} />
          {outcomeLabel}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="text-sm text-white">{opponentLabel}</div>
        {allianceLabel && (
          <div className="text-[11px] text-amber-300/80">[{allianceLabel}]</div>
        )}
        {extraGuildCount > 0 && (
          <div className="text-[10px] text-gray-500">+{extraGuildCount} 길드</div>
        )}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <div className="text-xs text-gray-300 font-mono">
          <span className="text-emerald-400">{row.homeKills}</span>
          <span className="text-gray-600">/</span>
          <span className="text-red-400">{row.homeDeaths}</span>
        </div>
        <div className="text-[10px] text-gray-500 font-mono">
          {formatFame(row.homeKillFame)} vs {formatFame(row.opponentKillFame)}
        </div>
      </td>
      <td className="px-3 py-2 text-gray-400 text-xs">
        {row.clusterName ?? '-'}
      </td>
    </tr>
  )
}
