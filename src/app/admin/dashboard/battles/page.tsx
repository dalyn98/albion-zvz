import { getTranslations } from 'next-intl/server'
import { Swords, Info } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import BattleRecordList, {
  type BattleRecordRow,
} from '@/components/BattleRecordList'
import { isSizeCategory, SIZE_CATEGORIES } from '@/lib/albion-battles'

export const dynamic = 'force-dynamic'

interface SearchParams {
  size?: string
  outcome?: string
}

const PAGE_LIMIT = 50

export default async function AdminBattlesPage({
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
  if (!session) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)

  const sizeFilter = sp.size && isSizeCategory(sp.size) ? sp.size : null
  const outcomeFilter =
    sp.outcome === 'win' || sp.outcome === 'loss' || sp.outcome === 'tie'
      ? sp.outcome
      : null

  const db = getAdminClient()
  let query = db
    .from('tenant_battle_records')
    .select(
      'id, battle_record_id, home_guild_name, home_alliance_name, home_team_size, home_kills, home_deaths, home_kill_fame, opponent_team_size, opponent_kills, opponent_deaths, opponent_kill_fame, opponent_guild_names, opponent_alliance_names, primary_opponent_name, size_category, outcome, started_at, battle_records!inner(albion_battle_id, cluster_name)',
    )
    .eq('guild_id', guildId)
    .order('started_at', { ascending: false })
    .limit(PAGE_LIMIT)
  if (sizeFilter) query = query.eq('size_category', sizeFilter)
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
      sizeCategory: r.size_category as (typeof SIZE_CATEGORIES)[number],
      outcome: r.outcome as 'win' | 'loss' | 'tie',
    }
  })

  return (
    <div className="space-y-5">
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
        sizeFilter={sizeFilter}
        outcomeFilter={outcomeFilter}
        emptyLabel={t('empty')}
        filterSizeLabel={t('filterSize')}
        filterOutcomeLabel={t('filterOutcome')}
        filterAllLabel={tCommon('all')}
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
        columnLabels={{
          startedAt: t('colStartedAt'),
          size: t('colSize'),
          outcome: t('colOutcome'),
          opponent: t('colOpponent'),
          kdfame: t('colKdFame'),
          cluster: t('colCluster'),
        }}
      />
    </div>
  )
}
