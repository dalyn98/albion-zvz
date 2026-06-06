import type { getAdminClient } from '@/lib/supabase-admin'
import { isMissingRpcError } from '@/lib/supabase-rpc-errors'

type Db = ReturnType<typeof getAdminClient>

const MEMBER_LEADERBOARD_ROLLUPS_PAGE_SIZE = 1000

export interface MemberLeaderboardRollupRow {
  albion_player_id: string | null
  kills: number | string | null
  deaths: number | string | null
  participations: number | string | null
  death_battles: number | string | null
  wins: number | string | null
  losses: number | string | null
}

export async function fetchMemberLeaderboardRollups(
  db: Db,
  guildId: string,
  cutoff: string,
  bundleSplits: boolean,
): Promise<MemberLeaderboardRollupRow[] | null> {
  const rows: MemberLeaderboardRollupRow[] = []
  const rpcName = 'member_leaderboard_rollups'
  for (let from = 0; ; from += MEMBER_LEADERBOARD_ROLLUPS_PAGE_SIZE) {
    const { data, error } = await db
      .rpc(rpcName, {
        p_guild_id: guildId,
        p_since: cutoff,
        p_bundle_splits: bundleSplits,
      })
      .range(from, from + MEMBER_LEADERBOARD_ROLLUPS_PAGE_SIZE - 1)

    if (error) {
      if (isMissingRpcError(error, rpcName)) return null
      throw new Error(error.message)
    }

    const page = (data ?? []) as MemberLeaderboardRollupRow[]
    rows.push(...page)
    if (page.length < MEMBER_LEADERBOARD_ROLLUPS_PAGE_SIZE) return rows
  }
}

export function numberFromRollupValue(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}
