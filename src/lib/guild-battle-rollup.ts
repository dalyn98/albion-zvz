import { cache } from 'react'
import { getAppSetting } from '@/lib/app-settings'
import { bundleSplitBattles, type BundleableRow } from '@/lib/battle-bundling'
import { getAdminClient } from '@/lib/supabase-admin'
import { isMissingRpcError } from '@/lib/supabase-rpc-errors'
import { selectPagedRowsOrThrow, type SupabasePagedQuery } from '@/lib/supabase-pagination'

export interface GuildBattleRollup {
  battleCount: number
  winCount: number
  lossCount: number
  tieCount: number
  totalKills: number
  totalDeaths: number
}

interface GuildBattleRollupRpcRow {
  battle_count: number | string | null
  win_count: number | string | null
  loss_count: number | string | null
  tie_count: number | string | null
  total_kills: number | string | null
  total_deaths: number | string | null
}

function numberFromRpc(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function fromRpcRow(row: GuildBattleRollupRpcRow | null | undefined): GuildBattleRollup {
  return {
    battleCount: numberFromRpc(row?.battle_count),
    winCount: numberFromRpc(row?.win_count),
    lossCount: numberFromRpc(row?.loss_count),
    tieCount: numberFromRpc(row?.tie_count),
    totalKills: numberFromRpc(row?.total_kills),
    totalDeaths: numberFromRpc(row?.total_deaths),
  }
}

const loadGuildBattleRollupCached = cache(async (
  guildId: string,
  sinceIso: string | null,
): Promise<GuildBattleRollup> => {
  const db = getAdminClient()
  const bundleEnabled =
    (await getAppSetting('bundle_split_battles_in_stats', 'false', guildId)) === 'true'

  const { data, error } = await db.rpc('guild_battle_rollup', {
    p_guild_id: guildId,
    p_since: sinceIso ?? null,
    p_bundle_splits: bundleEnabled,
  })
  if (!error) {
    const row = Array.isArray(data) ? data[0] : data
    return fromRpcRow(row as GuildBattleRollupRpcRow | null | undefined)
  }
  if (!isMissingRpcError(error, 'guild_battle_rollup')) {
    throw new Error(error.message)
  }

  return loadGuildBattleRollupFallback(guildId, sinceIso, bundleEnabled)
})

export async function loadGuildBattleRollup(
  guildId: string,
  sinceIso?: string | null,
): Promise<GuildBattleRollup> {
  return loadGuildBattleRollupCached(guildId, sinceIso ?? null)
}

async function loadGuildBattleRollupFallback(
  guildId: string,
  sinceIso: string | null | undefined,
  bundleEnabled: boolean,
): Promise<GuildBattleRollup> {
  const db = getAdminClient()
  const rows = await selectPagedRowsOrThrow<BundleableRow>({
    label: 'guild battle rollup fallback',
    buildQuery: () => {
      let q = db
        .from('tenant_zvz_battle_records')
        .select(
          'battle_record_id, outcome, home_kills, home_deaths, home_team_size, main_opponent_team_size',
        )
        .eq('guild_id', guildId)
      if (sinceIso) q = q.gte('started_at', sinceIso)
      return q
        .order('started_at', { ascending: true })
        .order('battle_record_id', { ascending: true }) as unknown as SupabasePagedQuery<BundleableRow>
    },
  })

  const rollup: GuildBattleRollup = {
    battleCount: 0,
    winCount: 0,
    lossCount: 0,
    tieCount: 0,
    totalKills: 0,
    totalDeaths: 0,
  }
  const evaluated = bundleEnabled
    ? bundleSplitBattles(rows).map((b) => ({
        outcome: b.outcome,
        homeKills: b.homeKills,
        homeDeaths: b.homeDeaths,
        homeTeamSize: b.homeTeamSize,
      }))
    : rows.map((row) => ({
        outcome: row.outcome,
        homeKills: row.home_kills,
        homeDeaths: row.home_deaths,
        homeTeamSize: row.home_team_size,
      }))

  for (const battle of evaluated) {
    rollup.battleCount += 1
    rollup.totalKills += battle.homeKills ?? 0
    rollup.totalDeaths += battle.homeDeaths ?? 0
    if (battle.outcome === 'win') rollup.winCount += 1
    else if (battle.outcome === 'loss') rollup.lossCount += 1
    else if (battle.outcome === 'tie') rollup.tieCount += 1
  }
  return rollup
}
