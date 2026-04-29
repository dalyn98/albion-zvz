// 길드 단위 "지난 7일" at-a-glance 집계. 홈 페이지 상단에 작은 위젯으로 노출.
// /battles 와 동일한 low-engagement 컷을 적용해 진짜 ZvZ 만 집계 (1:1 갱킹 제외).
//
// 별도의 helper 로 두는 이유: tracked-kills.ts 의 fetchTrackedBattleWindows 는
// 시간창/매칭에 특화돼 있어 home_kills/home_deaths 를 출력에서 제거한다. 위젯은
// 그 두 값이 필요해 별도로 같은 컷 로직을 적용하면서 raw 합계를 유지한다.

import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { isHighEngagement } from '@/lib/low-engagement-cut'
import { bundleSplitBattles, type BundleableRow } from '@/lib/battle-bundling'

export interface GuildWeeklyStats {
  battleCount: number
  winCount: number
  lossCount: number
  tieCount: number
  totalKills: number
  totalDeaths: number
  sinceIso: string
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export async function loadGuildWeeklyStats(guildId: string): Promise<GuildWeeklyStats> {
  const sinceIso = new Date(Date.now() - WEEK_MS).toISOString()
  const db = getAdminClient()
  const { data } = await db
    .from('tenant_battle_records')
    .select(
      'battle_record_id, outcome, home_kills, home_deaths, home_team_size, main_opponent_team_size',
    )
    .eq('guild_id', guildId)
    .gte('started_at', sinceIso)

  const rows = (data ?? []) as BundleableRow[]
  const bundleEnabled =
    (await getAppSetting('bundle_split_battles_in_stats', 'false', guildId)) === 'true'

  const stats: GuildWeeklyStats = {
    battleCount: 0,
    winCount: 0,
    lossCount: 0,
    tieCount: 0,
    totalKills: 0,
    totalDeaths: 0,
    sinceIso,
  }

  if (bundleEnabled) {
    const bundled = bundleSplitBattles(rows)
    for (const b of bundled) {
      if (
        !isHighEngagement({
          homeKills: b.homeKills,
          homeDeaths: b.homeDeaths,
          homeTeamSize: b.homeTeamSize,
        })
      ) {
        continue
      }
      stats.battleCount += 1
      stats.totalKills += b.homeKills
      stats.totalDeaths += b.homeDeaths
      if (b.outcome === 'win') stats.winCount += 1
      else if (b.outcome === 'loss') stats.lossCount += 1
      else if (b.outcome === 'tie') stats.tieCount += 1
    }
    return stats
  }

  for (const row of rows) {
    if (
      !isHighEngagement({
        homeKills: row.home_kills,
        homeDeaths: row.home_deaths,
        homeTeamSize: row.home_team_size,
      })
    ) {
      continue
    }
    stats.battleCount += 1
    stats.totalKills += row.home_kills ?? 0
    stats.totalDeaths += row.home_deaths ?? 0
    if (row.outcome === 'win') stats.winCount += 1
    else if (row.outcome === 'loss') stats.lossCount += 1
    else if (row.outcome === 'tie') stats.tieCount += 1
  }

  return stats
}
