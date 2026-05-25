'use client'

// 전투기록 목록 — 서버 컴포넌트가 조회한 행을 받아 탭(최근/규모) + 결과 드롭다운
// + 테이블 렌더. 탭 전환은 ?tab=, 결과 필터는 ?outcome= 으로 RSC 재조회.
//
// 표기 규칙: "70v80" 같은 사이즈 표기는 mainOpponentTeamSize 사용 (전체 합산이
// 아닌 "주 상대 알라이언스/길드" 만). matchTotal>1 일 때 "1/2 분리 매치업" 배지,
// isProvisional=true 일 때 "판정 중" 배지로 사용자에게 명시.
//
// 규모 시각 구분: size_category 별 컬러 토큰 (sky/emerald/orange/rose) 으로
// 사이즈 배지를 톤 차이로 한눈에 구분. 분리 매치업의 violet 좌측 border 와
// 색이 안 겹치도록 의도적으로 조합.

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Trophy, Skull, Minus, GitBranch, Hourglass, CornerDownRight } from 'lucide-react'
import Link from 'next/link'
import type { SizeCategory } from '@/lib/albion-battles'
import { formatDateTimeShort } from '@/lib/format-datetime'

// 규모별 톤 — 사이즈 배지 (사이즈 셀의 첫 인라인 박스). dot 은 규모 직관 신호.
const SIZE_TONE: Record<SizeCategory, { badge: string; dot: string }> = {
  small: {
    badge: 'bg-sky-500/10 border-sky-500/30 text-sky-200',
    dot: 'bg-sky-400',
  },
  middle: {
    badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200',
    dot: 'bg-emerald-400',
  },
  large: {
    badge: 'bg-orange-500/10 border-orange-500/30 text-orange-200',
    dot: 'bg-orange-400',
  },
  zerg: {
    badge: 'bg-rose-500/15 border-rose-500/40 text-rose-200',
    dot: 'bg-rose-400',
  },
}

export type BattleListTab = 'recent' | SizeCategory

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
  // 주 상대 (단일 알라이언스 또는 단독 길드). UI 표기/필터의 기준.
  mainOpponentTeamSize: number
  mainOpponentKillFame: number
  mainOpponentName: string
  mainOpponentKind: 'alliance' | 'guild' | 'pending' | 'legacy'
  matchIndex: number
  matchTotal: number
  isProvisional: boolean
  sizeCategory: SizeCategory
  outcome: 'win' | 'loss' | 'tie'
}

interface Props {
  rows: BattleRecordRow[]
  timezone: string
  activeTab: BattleListTab
  outcomeFilter: 'win' | 'loss' | 'tie' | null
  emptyLabel: string
  filterOutcomeLabel: string
  filterAllLabel: string
  tabLabels: Record<BattleListTab, string>
  sizeLabels: Record<SizeCategory, string>
  outcomeLabels: Record<'win' | 'loss' | 'tie', string>
  matchSplitLabel: string
  sameBattleLabel: string
  provisionalLabel: string
  columnLabels: {
    startedAt: string
    size: string
    outcome: string
    opponent: string
    kdfame: string
    cluster: string
  }
}

// 같은 albionBattleId 의 분리 매치업 row 들을 시각적으로 묶기 위한 그룹 역할.
// 'single' = 단일 매치업, 'first' = 그룹의 첫 행, 'continuation' = 그룹의 이어지는 행.
type GroupRole = 'single' | 'first' | 'continuation'

const TABS: BattleListTab[] = ['recent', 'small', 'middle', 'large', 'zerg']
const OUTCOMES: Array<'win' | 'loss' | 'tie'> = ['win', 'loss', 'tie']

function formatFame(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatStartedAt(iso: string, timezone: string): string {
  return formatDateTimeShort(iso, timezone)
}

function computeGroupRoles(rows: BattleRecordRow[]): GroupRole[] {
  // 같은 albionBattleId 의 row 가 1개면 single, 2개 이상이면 첫번째만 first,
  // 나머지는 continuation. rows 는 page.tsx 에서 (started_at desc, match_index asc)
  // 로 정렬되어 같은 battle 의 row 가 인접해 있다.
  const counts = new Map<number, number>()
  for (const r of rows) counts.set(r.albionBattleId, (counts.get(r.albionBattleId) ?? 0) + 1)
  const seen = new Set<number>()
  const roles: GroupRole[] = []
  for (const r of rows) {
    const total = counts.get(r.albionBattleId) ?? 1
    if (total === 1) {
      roles.push('single')
      continue
    }
    if (!seen.has(r.albionBattleId)) {
      seen.add(r.albionBattleId)
      roles.push('first')
    } else {
      roles.push('continuation')
    }
  }
  return roles
}

export default function BattleRecordList({
  rows,
  timezone,
  activeTab,
  outcomeFilter,
  emptyLabel,
  filterOutcomeLabel,
  filterAllLabel,
  tabLabels,
  sizeLabels,
  outcomeLabels,
  matchSplitLabel,
  sameBattleLabel,
  provisionalLabel,
  columnLabels,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const selectTab = (next: BattleListTab) => {
    if (next === activeTab) return
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'recent') params.delete('tab')
    else params.set('tab', next)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const setOutcome = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (!value) params.delete('outcome')
    else params.set('outcome', value)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  return (
    <div className="space-y-3">
      <nav
        role="tablist"
        className="flex gap-1 border-b border-gray-800 overflow-x-auto"
      >
        {TABS.map((key) => {
          const isActive = activeTab === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => selectTab(key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                isActive
                  ? 'text-amber-300 border-amber-400'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              {tabLabels[key]}
            </button>
          )
        })}
      </nav>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-gray-400 text-xs">{filterOutcomeLabel}</label>
          <select
            value={outcomeFilter ?? ''}
            onChange={(e) => setOutcome(e.target.value)}
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
          <table className="w-full text-base">
            <thead className="bg-gray-950/60 text-gray-400 text-sm">
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
              {(() => {
                const roles = computeGroupRoles(rows)
                return rows.map((row, i) => (
                  <BattleRow
                    key={row.id}
                    row={row}
                    groupRole={roles[i]}
                    sizeLabel={sizeLabels[row.sizeCategory]}
                    outcomeLabel={outcomeLabels[row.outcome]}
                    matchSplitLabel={matchSplitLabel}
                    sameBattleLabel={sameBattleLabel}
                    provisionalLabel={provisionalLabel}
                    timezone={timezone}
                    router={router}
                  />
                ))
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

interface BattleRowProps {
  row: BattleRecordRow
  groupRole: GroupRole
  sizeLabel: string
  outcomeLabel: string
  matchSplitLabel: string
  sameBattleLabel: string
  provisionalLabel: string
  timezone: string
  router: ReturnType<typeof useRouter>
}

function BattleRow({
  row,
  groupRole,
  sizeLabel,
  outcomeLabel,
  matchSplitLabel,
  sameBattleLabel,
  provisionalLabel,
  timezone,
  router,
}: BattleRowProps) {
  const outcomeColor =
    row.outcome === 'win'
      ? 'text-emerald-400'
      : row.outcome === 'loss'
        ? 'text-red-400'
        : 'text-gray-400'
  const OutcomeIcon =
    row.outcome === 'win' ? Trophy : row.outcome === 'loss' ? Skull : Minus

  // 주 상대 = mainOpponentName (alliance 명 또는 단독 길드명). 합산 합치 노출
  // 안 함 — 그건 BattleDetailView 의 길드별 분해에서.
  const opponentLabel = row.mainOpponentName || row.primaryOpponentName || '-'

  // 분리 매치업 시각화: 그룹의 모든 row 에 violet 좌측 보더 + 살짝 tint, 첫 행은
  // 일반 상단 보더, 이어지는 행(continuation) 은 점선 상단 + 시간 셀에 "↳ 같은
  // 전투" 인디케이터로 명시. 단일 매치업(single) 은 기존 스타일 그대로.
  const isSplit = groupRole !== 'single'
  const isContinuation = groupRole === 'continuation'
  const rowClass = isSplit
    ? `cursor-pointer hover:bg-gray-800/40 border-l-2 border-l-violet-500/40 bg-violet-500/[0.03] ${
        isContinuation ? 'border-t border-t-dashed border-violet-500/20' : 'border-t border-gray-800'
      }`
    : 'border-t border-gray-800 hover:bg-gray-800/40 cursor-pointer'

  // table 구조 유지: <tr> 에 onClick 으로 router.push, 첫 셀에도 실제 Link 로
  // 접근성/middle-click/새 탭 열기 지원. Link 클릭은 stopPropagation 으로
  // router.push 중복 호출을 막는다.
  const href = `/battles/${row.id}`
  return (
    <tr onClick={() => router.push(href)} className={rowClass}>
      <td className="px-3 py-2 text-gray-300 font-mono text-sm whitespace-nowrap">
        {isContinuation ? (
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-violet-300 hover:text-violet-200"
            title={sameBattleLabel}
          >
            <CornerDownRight size={14} />
            <span className="text-xs uppercase tracking-wider font-semibold">{sameBattleLabel}</span>
          </Link>
        ) : (
          <Link
            href={href}
            onClick={(e) => e.stopPropagation()}
            className="hover:text-white"
          >
            {formatStartedAt(row.startedAt, timezone)}
          </Link>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <span
            className={`inline-flex items-center gap-1.5 border rounded px-2 py-0.5 text-[13px] font-medium ${
              SIZE_TONE[row.sizeCategory].badge
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${SIZE_TONE[row.sizeCategory].dot}`}
              aria-hidden
            />
            {sizeLabel}
            <span className="opacity-70 font-mono">
              {row.homeTeamSize}v{row.mainOpponentTeamSize}
            </span>
          </span>
          {row.matchTotal > 1 && (
            <span
              className="inline-flex items-center gap-0.5 bg-violet-500/15 border border-violet-500/30 rounded px-1.5 py-0.5 text-xs text-violet-300"
              title={matchSplitLabel}
            >
              <GitBranch size={12} />
              {row.matchIndex}/{row.matchTotal}
            </span>
          )}
          {row.isProvisional && (
            <span
              className="inline-flex items-center gap-0.5 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 text-xs text-amber-300"
              title={provisionalLabel}
            >
              <Hourglass size={12} />
              {provisionalLabel}
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center gap-1 text-sm font-semibold ${outcomeColor}`}>
          <OutcomeIcon size={14} />
          {outcomeLabel}
        </span>
      </td>
      <td className="px-3 py-2">
        <div className="text-base text-white">{opponentLabel}</div>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <div className="text-sm text-gray-300 font-mono">
          <span className="text-emerald-400">{row.homeKills}</span>
          <span className="text-gray-600">/</span>
          <span className="text-red-400">{row.homeDeaths}</span>
        </div>
        <div className="text-xs text-gray-500 font-mono">
          {formatFame(row.homeKillFame)} vs {formatFame(row.mainOpponentKillFame)}
        </div>
      </td>
      <td className="px-3 py-2 text-gray-400 text-sm">
        {row.clusterName ?? '-'}
      </td>
    </tr>
  )
}
