'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  Swords,
  Info,
  ChevronRight,
  Trophy,
  Skull,
  Minus,
  GitBranch,
  Hourglass,
  CornerDownRight,
  Sparkles,
} from 'lucide-react'
import DemoCTACard from '../_components/DemoCTACard'
import DemoGuidedTour from '../_components/DemoGuidedTour'

// 실 /battles 의 비주얼 클론 — 헤더 + 팁 카드 + 판정 규칙 details + 탭 + 결과
// 필터 + 전투기록 테이블. 데모에선 클라이언트 useState 로 탭/결과 필터를 실제로
// 적용 — pending 토스트 대신 진짜 필터링된 결과를 보여줘 실사용감 부여.

type SizeCategory = 'small' | 'middle' | 'large' | 'zerg'
type Outcome = 'win' | 'loss' | 'tie'
type Tab = 'recent' | SizeCategory
type OutcomeFilter = 'all' | Outcome

interface BattleRow {
  id: string
  albionBattleId: number
  startedAt: string
  homeTeamSize: number
  mainOpponentTeamSize: number
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  mainOpponentKillFame: number
  mainOpponentName: string
  matchIndex: number
  matchTotal: number
  isProvisional: boolean
  sizeCategory: SizeCategory
  outcome: Outcome
  clusterName: string
}

const SIZE_TONE: Record<SizeCategory, { badge: string; dot: string }> = {
  small: { badge: 'bg-sky-500/10 border-sky-500/30 text-sky-200', dot: 'bg-sky-400' },
  middle: { badge: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200', dot: 'bg-emerald-400' },
  large: { badge: 'bg-orange-500/10 border-orange-500/30 text-orange-200', dot: 'bg-orange-400' },
  zerg: { badge: 'bg-rose-500/15 border-rose-500/40 text-rose-200', dot: 'bg-rose-400' },
}

const OUTCOME_COLOR: Record<Outcome, string> = {
  win: 'text-emerald-400',
  loss: 'text-red-400',
  tie: 'text-gray-400',
}

const OUTCOME_ICON: Record<Outcome, React.ComponentType<{ size?: number }>> = {
  win: Trophy,
  loss: Skull,
  tie: Minus,
}

const DEMO_BATTLES: ReadonlyArray<BattleRow> = [
  {
    id: 'demo-b-1',
    albionBattleId: 4280001,
    startedAt: '2026-05-18T11:42:00Z',
    homeTeamSize: 95,
    mainOpponentTeamSize: 110,
    homeKills: 12,
    homeDeaths: 7,
    homeKillFame: 4_200_000,
    mainOpponentKillFame: 2_800_000,
    mainOpponentName: 'FREEMASONS',
    matchIndex: 1,
    matchTotal: 1,
    isProvisional: false,
    sizeCategory: 'zerg',
    outcome: 'win',
    clusterName: 'Avalonian Roads',
  },
  {
    id: 'demo-b-2',
    albionBattleId: 4280002,
    startedAt: '2026-05-18T10:08:00Z',
    homeTeamSize: 65,
    mainOpponentTeamSize: 78,
    homeKills: 8,
    homeDeaths: 14,
    homeKillFame: 1_900_000,
    mainOpponentKillFame: 3_100_000,
    mainOpponentName: 'LEGION',
    matchIndex: 1,
    matchTotal: 1,
    isProvisional: false,
    sizeCategory: 'large',
    outcome: 'loss',
    clusterName: 'Mercia',
  },
  {
    id: 'demo-b-3a',
    albionBattleId: 4280003,
    startedAt: '2026-05-18T09:14:00Z',
    homeTeamSize: 70,
    mainOpponentTeamSize: 82,
    homeKills: 15,
    homeDeaths: 6,
    homeKillFame: 3_500_000,
    mainOpponentKillFame: 1_800_000,
    mainOpponentName: 'INDESTRUCT',
    matchIndex: 1,
    matchTotal: 2,
    isProvisional: false,
    sizeCategory: 'large',
    outcome: 'win',
    clusterName: 'Anglia',
  },
  {
    id: 'demo-b-3b',
    albionBattleId: 4280003,
    startedAt: '2026-05-18T09:14:00Z',
    homeTeamSize: 70,
    mainOpponentTeamSize: 45,
    homeKills: 9,
    homeDeaths: 3,
    homeKillFame: 1_400_000,
    mainOpponentKillFame: 600_000,
    mainOpponentName: 'PHOENIX',
    matchIndex: 2,
    matchTotal: 2,
    isProvisional: false,
    sizeCategory: 'large',
    outcome: 'win',
    clusterName: 'Anglia',
  },
  {
    id: 'demo-b-4',
    albionBattleId: 4280004,
    startedAt: '2026-05-18T07:36:00Z',
    homeTeamSize: 42,
    mainOpponentTeamSize: 38,
    homeKills: 11,
    homeDeaths: 5,
    homeKillFame: 1_600_000,
    mainOpponentKillFame: 900_000,
    mainOpponentName: 'CRYSTAL ASSEMBLY',
    matchIndex: 1,
    matchTotal: 1,
    isProvisional: false,
    sizeCategory: 'middle',
    outcome: 'win',
    clusterName: 'Cumbria',
  },
  {
    id: 'demo-b-5',
    albionBattleId: 4280005,
    startedAt: '2026-05-17T22:21:00Z',
    homeTeamSize: 35,
    mainOpponentTeamSize: 40,
    homeKills: 7,
    homeDeaths: 7,
    homeKillFame: 1_200_000,
    mainOpponentKillFame: 1_200_000,
    mainOpponentName: 'DEFAULT',
    matchIndex: 1,
    matchTotal: 1,
    isProvisional: false,
    sizeCategory: 'middle',
    outcome: 'tie',
    clusterName: 'Caerleon',
  },
  {
    id: 'demo-b-6',
    albionBattleId: 4280006,
    startedAt: '2026-05-17T20:05:00Z',
    homeTeamSize: 18,
    mainOpponentTeamSize: 22,
    homeKills: 3,
    homeDeaths: 9,
    homeKillFame: 400_000,
    mainOpponentKillFame: 1_100_000,
    mainOpponentName: 'Roadhouse',
    matchIndex: 1,
    matchTotal: 1,
    isProvisional: true,
    sizeCategory: 'small',
    outcome: 'loss',
    clusterName: 'Royals',
  },
  {
    id: 'demo-b-7',
    albionBattleId: 4280007,
    startedAt: '2026-05-17T18:52:00Z',
    homeTeamSize: 14,
    mainOpponentTeamSize: 12,
    homeKills: 6,
    homeDeaths: 1,
    homeKillFame: 900_000,
    mainOpponentKillFame: 300_000,
    mainOpponentName: 'GAMER GANG',
    matchIndex: 1,
    matchTotal: 1,
    isProvisional: false,
    sizeCategory: 'small',
    outcome: 'win',
    clusterName: 'Mists',
  },
]

type GroupRole = 'single' | 'first' | 'continuation'

function computeGroupRoles(rows: ReadonlyArray<BattleRow>): GroupRole[] {
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

function formatFame(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function formatStartedAtKst(iso: string): string {
  const d = new Date(iso)
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(kst.getUTCDate()).padStart(2, '0')
  const hh = String(kst.getUTCHours()).padStart(2, '0')
  const mm = String(kst.getUTCMinutes()).padStart(2, '0')
  return `${month}/${day} ${hh}:${mm}`
}

const TABS: ReadonlyArray<Tab> = ['recent', 'small', 'middle', 'large', 'zerg']
const OUTCOMES: ReadonlyArray<OutcomeFilter> = ['all', 'win', 'loss', 'tie']
const BATTLES_TOUR_STEPS = [
  { id: 'battles-rules' },
  { id: 'battles-filters' },
  { id: 'battles-table' },
] as const

export default function DemoBattlesPage() {
  const t = useTranslations('battleTracking')
  const tCommon = useTranslations('common')
  const tDemoMe = useTranslations('demo.me')
  const tDemoBattles = useTranslations('demo.battles')
  const tCta = useTranslations('demo.ctaCard')

  const [activeTab, setActiveTab] = useState<Tab>('recent')
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all')

  const tabLabels: Record<Tab, string> = {
    recent: t('tabRecent'),
    small: t('size_small'),
    middle: t('size_middle'),
    large: t('size_large'),
    zerg: t('size_zerg'),
  }
  const outcomeLabels: Record<Outcome, string> = {
    win: t('outcome_win'),
    loss: t('outcome_loss'),
    tie: t('outcome_tie'),
  }

  const filtered = useMemo(() => {
    return DEMO_BATTLES.filter((r) => {
      if (activeTab !== 'recent' && r.sizeCategory !== activeTab) return false
      if (outcomeFilter !== 'all' && r.outcome !== outcomeFilter) return false
      return true
    })
  }, [activeTab, outcomeFilter])

  const roles = useMemo(() => computeGroupRoles(filtered), [filtered])

  return (
    <main className="flex-1 w-full max-w-3xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-5">
      <DemoGuidedTour steps={BATTLES_TOUR_STEPS} namespace="battles" />
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-start gap-3">
          <Swords size={20} className="text-amber-400 mt-1" />
          <div>
            <h1 className="text-2xl font-bold text-white">{t('listTitle')}</h1>
            <p className="text-gray-500 text-sm mt-1">{t('listDescription')}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-200 border border-amber-400/40 uppercase tracking-wider">
          <Sparkles size={11} />
          {tDemoMe('viewingAsEyebrow')}
        </span>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-start gap-2.5">
        <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-amber-200 text-sm">{tDemoBattles('notice')}</p>
      </div>

      <div data-tour-id="battles-rules" className="bg-gray-950/50 border border-gray-800 rounded-lg p-3 space-y-2">
        <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
          <Info size={12} />
          <span className="font-semibold text-amber-300">{t('tipTitle')}</span>
        </p>
        <ul className="text-[11px] text-gray-500 list-disc list-inside space-y-1">
          <li>{t('tipMatch')}</li>
          <li>{t('tipEngagement')}</li>
          <li>{t('tipOutcome')}</li>
          <li>{t('tipLimitation')}</li>
        </ul>
        <details className="group pt-1">
          <summary className="cursor-pointer text-[11px] text-amber-300/80 hover:text-amber-300 list-none flex items-center gap-1 select-none">
            <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
            <span className="underline-offset-2 group-hover:underline">{t('rulesShowMore')}</span>
          </summary>
          <div className="mt-3 space-y-3 text-[11px] text-gray-400 leading-relaxed">
            <p className="text-gray-500">{t('rulesIntro')}</p>
            <div className="space-y-1">
              <h4 className="text-amber-200/90 font-semibold">{t('rule1Title')}</h4>
              <p>{t('rule1Body')}</p>
            </div>
            <div className="space-y-1">
              <h4 className="text-amber-200/90 font-semibold">{t('rule2Title')}</h4>
              <p>{t('rule2Intro')}</p>
              <ul className="list-disc list-inside ml-2 space-y-0.5 text-gray-500">
                <li>{t('rule2Small')}</li>
                <li>{t('rule2Middle')}</li>
                <li>{t('rule2Large')}</li>
                <li>{t('rule2Zerg')}</li>
              </ul>
              <p className="text-gray-500 italic">{t('rule2CutOff')}</p>
            </div>
            <div className="space-y-1">
              <h4 className="text-amber-200/90 font-semibold">{t('rule3Title')}</h4>
              <p>{t('rule3Body')}</p>
              <p className="text-gray-500 italic">{t('rule3Why')}</p>
            </div>
            <div className="space-y-1">
              <h4 className="text-amber-200/90 font-semibold">{t('rule4Title')}</h4>
              <p>{t('rule4Body')}</p>
            </div>
            <div className="space-y-1">
              <h4 className="text-amber-200/90 font-semibold">{t('rule5Title')}</h4>
              <p>{t('rule5Body')}</p>
            </div>
            <div className="space-y-1">
              <h4 className="text-amber-200/90 font-semibold">{t('rule6Title')}</h4>
              <p>{t('rule6Body')}</p>
            </div>
            <div className="space-y-1 border-t border-gray-800 pt-2">
              <h4 className="text-amber-200/90 font-semibold">{t('rulesLimitTitle')}</h4>
              <ul className="list-disc list-inside ml-2 space-y-0.5 text-gray-500">
                <li>{t('rulesLimit1')}</li>
                <li>{t('rulesLimit2')}</li>
              </ul>
            </div>
          </div>
        </details>
      </div>

      <div data-tour-id="battles-filters" className="space-y-3">
        <nav role="tablist" className="flex gap-1 border-b border-gray-800 overflow-x-auto">
          {TABS.map((key) => {
            const isActive = key === activeTab
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(key)}
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
            <label htmlFor="demo-battles-outcome" className="text-gray-400 text-xs">
              {t('filterOutcome')}
            </label>
            <select
              id="demo-battles-outcome"
              value={outcomeFilter}
              onChange={(e) => setOutcomeFilter(e.target.value as OutcomeFilter)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white cursor-pointer hover:border-amber-500/40 focus:border-amber-500 focus:outline-none"
            >
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {o === 'all' ? tCommon('all') : outcomeLabels[o]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div data-tour-id="battles-table" className="overflow-x-auto bg-gray-900 border border-gray-700 rounded-xl">
          <table className="w-full text-base">
            <thead className="bg-gray-950/60 text-gray-400 text-sm">
              <tr>
                <th className="text-left px-3 py-2">{t('colStartedAt')}</th>
                <th className="text-left px-3 py-2">{t('colSize')}</th>
                <th className="text-left px-3 py-2">{t('colOutcome')}</th>
                <th className="text-left px-3 py-2">{t('colOpponent')}</th>
                <th className="text-right px-3 py-2">{t('colKdFame')}</th>
                <th className="text-left px-3 py-2">{t('colCluster')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-12 text-center text-gray-500 text-sm border-t border-gray-800"
                  >
                    {tCommon('searchNoResults')}
                  </td>
                </tr>
              ) : (
                filtered.map((row, i) => {
                  const groupRole = roles[i]
                  const isSplit = groupRole !== 'single'
                  const isContinuation = groupRole === 'continuation'
                  const rowClass = isSplit
                    ? `border-l-2 border-l-violet-500/40 bg-violet-500/[0.03] ${
                        isContinuation
                          ? 'border-t border-t-dashed border-violet-500/20'
                          : 'border-t border-gray-800'
                      }`
                    : 'border-t border-gray-800'
                  const OutcomeIcon = OUTCOME_ICON[row.outcome]
                  return (
                    <tr key={row.id} className={`${rowClass} hover:bg-gray-800/40`}>
                      <td className="px-3 py-2 text-gray-300 font-mono text-sm whitespace-nowrap">
                        {isContinuation ? (
                          <span
                            className="inline-flex items-center gap-1 text-violet-300"
                            title={t('sameBattleLabel')}
                          >
                            <CornerDownRight size={14} />
                            <span className="text-xs uppercase tracking-wider font-semibold">
                              {t('sameBattleLabel')}
                            </span>
                          </span>
                        ) : (
                          <span className="text-gray-300">{formatStartedAtKst(row.startedAt)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <span
                            className={`inline-flex items-center gap-1.5 border rounded px-2 py-0.5 text-[13px] font-medium ${SIZE_TONE[row.sizeCategory].badge}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${SIZE_TONE[row.sizeCategory].dot}`}
                              aria-hidden
                            />
                            {tabLabels[row.sizeCategory]}
                            <span className="opacity-70 font-mono">
                              {row.homeTeamSize}v{row.mainOpponentTeamSize}
                            </span>
                          </span>
                          {row.matchTotal > 1 && (
                            <span
                              className="inline-flex items-center gap-0.5 bg-violet-500/15 border border-violet-500/30 rounded px-1.5 py-0.5 text-xs text-violet-300"
                              title={t('matchSplitLabel')}
                            >
                              <GitBranch size={12} />
                              {row.matchIndex}/{row.matchTotal}
                            </span>
                          )}
                          {row.isProvisional && (
                            <span
                              className="inline-flex items-center gap-0.5 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5 text-xs text-amber-300"
                              title={t('provisionalLabel')}
                            >
                              <Hourglass size={12} />
                              {t('provisionalLabel')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center gap-1 text-sm font-semibold ${OUTCOME_COLOR[row.outcome]}`}
                        >
                          <OutcomeIcon size={14} />
                          {outcomeLabels[row.outcome]}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-base text-white">{row.mainOpponentName}</div>
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
                      <td className="px-3 py-2 text-gray-400 text-sm">{row.clusterName}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <DemoCTACard
        eyebrow={tCta('eyebrow')}
        title={tDemoBattles('ctaTitle')}
        description={tDemoBattles('ctaDescription')}
        buttonLabel={tCta('buttonLabel')}
      />
    </main>
  )
}
