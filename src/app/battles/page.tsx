import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { Swords, Info } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import BattleRecordList, {
  type BattleRecordRow,
  type BattleListTab,
} from '@/components/BattleRecordList'
import { isSizeCategory, SIZE_CATEGORIES } from '@/lib/albion-battles'
import { isHighEngagement } from '@/lib/low-engagement-cut'

export const dynamic = 'force-dynamic'

interface SearchParams {
  tab?: string
  outcome?: string
}

const RECENT_LIMIT = 20
const SIZE_LIMIT = 50
// low-engagement 컷이 TS-side 라 결과 잘림 보정. 컷 통과 비율을 보수적으로
// ~30% 가정해 3x fetch 후 슬라이스. 컷 통과 행이 적은 길드는 그래도 limit 미만이
// 나올 수 있지만, 그건 실제로 표시할 만한 전투가 그만큼 없다는 의미.
const FETCH_OVERFETCH_MULTIPLIER = 3

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
  // low-engagement 컷 통과율을 ~30% 가정하고 3x 로 over-fetch 한 뒤 TS 에서 컷
  // 적용 → 정렬 유지하면서 limit 만큼 슬라이스. 컷이 RPC/SQL 표현으로 안 들어가는
  // 이유: PostgREST 가 산술 표현식 (team_size * 0.1) 을 지원하지 않아.
  let query = db
    .from('tenant_battle_records')
    .select(
      'id, battle_record_id, home_guild_name, home_alliance_name, home_team_size, home_kills, home_deaths, home_kill_fame, opponent_team_size, opponent_kills, opponent_deaths, opponent_kill_fame, opponent_guild_names, opponent_alliance_names, primary_opponent_name, main_opponent_force_kind, main_opponent_force_name, main_opponent_team_size, main_opponent_kill_fame, match_index, match_total, is_provisional, size_category, outcome, started_at, battle_records!inner(albion_battle_id, cluster_name)',
    )
    .eq('guild_id', guildId)
    .order('started_at', { ascending: false })
    .order('match_index', { ascending: true })
    .limit(limit * FETCH_OVERFETCH_MULTIPLIER)
  if (activeTab !== 'recent') query = query.eq('size_category', activeTab)
  if (outcomeFilter) query = query.eq('outcome', outcomeFilter)

  const { data, error } = await query

  const filteredData = (data ?? []).filter((r) =>
    isHighEngagement({
      homeKills: r.home_kills as number,
      homeDeaths: r.home_deaths as number,
      homeTeamSize: r.home_team_size as number,
    }),
  )

  const rows: BattleRecordRow[] = filteredData.slice(0, limit).map((r) => {
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

      <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-3 space-y-1.5">
        <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
          <Info size={12} />
          <span className="font-semibold text-amber-300">{t('tipTitle')}</span>
        </p>
        <ul className="text-[11px] text-gray-500 list-disc list-inside space-y-1">
          <li>{t('tipMatch')}</li>
          <li>{t('tipOutcome')}</li>
          <li>{t('tipLimitation')}</li>
        </ul>
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
