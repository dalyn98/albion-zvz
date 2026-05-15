import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Swords, Info, ChevronRight } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import BattleRecordList, {
  type BattleRecordRow,
  type BattleListTab,
} from '@/components/BattleRecordList'
import { isSizeCategory, SIZE_CATEGORIES } from '@/lib/albion-battles'

export const dynamic = 'force-dynamic'

interface SearchParams {
  tab?: string
  outcome?: string
}

const RECENT_LIMIT = 20
const SIZE_LIMIT = 50
// mig 150 이전 — low-engagement 컷이 TS-side 라 over-fetch 후 슬라이스했다.
// mig 150 부터는 tenant_battle_records.is_high_engagement 생성 컬럼 + 부분
// 인덱스 (idx_tenant_battle_records_high_engagement) 로 SQL-side 정확 fetch.
// over-fetch multiplier 제거 — limit 만큼만 가져온다.

function resolveTab(raw: string | undefined): BattleListTab {
  if (raw && isSizeCategory(raw)) return raw
  return 'recent'
}

export default async function BattlesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const [sp, session, t, tCommon] = await Promise.all([
    searchParams,
    getSession(),
    getTranslations('battleTracking'),
    getTranslations('common'),
  ])
  if (!session) {
    redirect('/api/auth/discord/start?returnTo=/battles')
  }
  const guildId = await getSessionGuildId(session)

  const activeTab = resolveTab(sp.tab)
  const outcomeFilter =
    sp.outcome === 'win' || sp.outcome === 'loss' || sp.outcome === 'tie'
      ? sp.outcome
      : null

  // guildId 는 session 에서 내려와 사용자가 자기 tenant 외 데이터를 볼 수 없음.
  // 관리자 클라이언트는 RLS 를 우회해도 .eq('guild_id') 로 명시적 스코프 유지.
  const db = getAdminClient()
  const limit = activeTab === 'recent' ? RECENT_LIMIT : SIZE_LIMIT
  // is_high_engagement = (home_kills+home_deaths) >= home_team_size*0.1 OR home_deaths >= 3
  // (mig 150 의 STORED generated column). SQL-side 필터 + 전용 인덱스로 정확
  // fetch — TS 측 후처리 필터 제거.
  let query = db
    .from('tenant_battle_records')
    .select(
      'id, battle_record_id, home_guild_name, home_alliance_name, home_team_size, home_kills, home_deaths, home_kill_fame, opponent_team_size, opponent_kills, opponent_deaths, opponent_kill_fame, opponent_guild_names, opponent_alliance_names, primary_opponent_name, main_opponent_force_kind, main_opponent_force_name, main_opponent_team_size, main_opponent_kill_fame, match_index, match_total, is_provisional, size_category, outcome, started_at, battle_records!inner(albion_battle_id, cluster_name)',
    )
    .eq('guild_id', guildId)
    .eq('is_high_engagement', true)
    .order('started_at', { ascending: false })
    .order('match_index', { ascending: true })
    .limit(limit)
  if (activeTab !== 'recent') query = query.eq('size_category', activeTab)
  if (outcomeFilter) query = query.eq('outcome', outcomeFilter)

  const { data, error } = await query

  const rows: BattleRecordRow[] = (data ?? []).map((r) => {
    const battle = Array.isArray(r.battle_records) ? r.battle_records[0] : r.battle_records
    return {
      id: r.id as string,
      albionBattleId: battle?.albion_battle_id as number,
      clusterName: (battle?.cluster_name as string | null) ?? null,
      startedAt: r.started_at as string,
      homeGuildName: r.home_guild_name as string,
      homeAllianceName: (r.home_alliance_name as string | null) ?? null,
      homeTeamSize: r.home_team_size as number,
      homeKills: r.home_kills as number,
      homeDeaths: r.home_deaths as number,
      homeKillFame: r.home_kill_fame as number,
      opponentTeamSize: r.opponent_team_size as number,
      opponentKills: r.opponent_kills as number,
      opponentDeaths: r.opponent_deaths as number,
      opponentKillFame: r.opponent_kill_fame as number,
      opponentGuildNames: (r.opponent_guild_names as string[] | null) ?? [],
      opponentAllianceNames: (r.opponent_alliance_names as string[] | null) ?? [],
      primaryOpponentName: (r.primary_opponent_name as string | null) ?? null,
      mainOpponentTeamSize: (r.main_opponent_team_size as number | null) ?? (r.opponent_team_size as number),
      mainOpponentKillFame:
        (r.main_opponent_kill_fame as number | null) ?? (r.opponent_kill_fame as number),
      mainOpponentName:
        (r.main_opponent_force_name as string | null) ??
        (r.primary_opponent_name as string | null) ??
        '-',
      mainOpponentKind:
        (r.main_opponent_force_kind as 'alliance' | 'guild' | 'pending' | 'legacy' | null) ??
        'legacy',
      matchIndex: (r.match_index as number | null) ?? 1,
      matchTotal: (r.match_total as number | null) ?? 1,
      isProvisional: (r.is_provisional as boolean | null) ?? false,
      sizeCategory: r.size_category as (typeof SIZE_CATEGORIES)[number],
      outcome: r.outcome as 'win' | 'loss' | 'tie',
    }
  })

  return (
    <main className="flex-1 w-full max-w-3xl xl:max-w-6xl 2xl:max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-5">
      <div className="flex items-start gap-3">
        <Swords size={20} className="text-amber-400 mt-1" />
        <div>
          <h1 className="text-2xl font-bold text-white">{t('listTitle')}</h1>
          <p className="text-gray-500 text-sm mt-1">{t('listDescription')}</p>
        </div>
      </div>

      <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-3 space-y-2">
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
            <ChevronRight
              size={12}
              className="transition-transform group-open:rotate-90"
            />
            <span className="underline-offset-2 group-hover:underline">
              {t('rulesShowMore')}
            </span>
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
              <h4 className="text-amber-200/90 font-semibold">
                {t('rulesLimitTitle')}
              </h4>
              <ul className="list-disc list-inside ml-2 space-y-0.5 text-gray-500">
                <li>{t('rulesLimit1')}</li>
                <li>{t('rulesLimit2')}</li>
              </ul>
            </div>
          </div>
        </details>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          <p className="text-red-400 text-sm">{error.message}</p>
        </div>
      )}

      <BattleRecordList
        rows={rows}
        activeTab={activeTab}
        outcomeFilter={outcomeFilter}
        emptyLabel={t('empty')}
        filterOutcomeLabel={t('filterOutcome')}
        filterAllLabel={tCommon('all')}
        tabLabels={{
          recent: t('tabRecent'),
          small: t('size_small'),
          middle: t('size_middle'),
          large: t('size_large'),
          zerg: t('size_zerg'),
        }}
        sizeLabels={{
          small: t('size_small'),
          middle: t('size_middle'),
          large: t('size_large'),
          zerg: t('size_zerg'),
        }}
        outcomeLabels={{
          win: t('outcome_win'),
          loss: t('outcome_loss'),
          tie: t('outcome_tie'),
        }}
        matchSplitLabel={t('matchSplitLabel')}
        sameBattleLabel={t('sameBattleLabel')}
        provisionalLabel={t('provisionalLabel')}
        columnLabels={{
          startedAt: t('colStartedAt'),
          size: t('colSize'),
          outcome: t('colOutcome'),
          opponent: t('colOpponent'),
          kdfame: t('colKdFame'),
          cluster: t('colCluster'),
        }}
      />
    </main>
  )
}
