import 'server-only'

import { unstable_cache } from 'next/cache'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import {
  buildPublicBattleGroupReport,
  type PublicBattleGroupReport,
  type PublicBattleRecordRow,
} from '@/lib/public-battle-report-model'
import { PUBLIC_ZVZ_SESSION_MAX_BATTLES } from '@/lib/public-zvz-battles'
import { getAdminClient } from '@/lib/supabase-admin'

const SESSION_REPORT_REVALIDATE_SECONDS = 60 * 60

async function loadPublicZvzBattleSessionReportUncached(
  server: AlbionServer,
  battleIdsKey: string,
  preferredForceKey: string,
): Promise<PublicBattleGroupReport | null> {
  const battleIds = battleIdsKey
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isSafeInteger(value) && value > 0)
    .slice(0, PUBLIC_ZVZ_SESSION_MAX_BATTLES)
  if (battleIds.length === 0) return null

  const db = getAdminClient()
  const { data, error } = await db
    .from('battle_records')
    .select(
      'id, albion_battle_id, started_at, ended_at, total_players, total_kills, total_fame, cluster_name, raw_battle',
    )
    .eq('albion_server', server)
    .in('albion_battle_id', battleIds)
    .order('started_at', { ascending: true })
  if (error) {
    throw new Error(`public battle session detail query failed: ${error.message}`)
  }

  return buildPublicBattleGroupReport({
    server,
    requestedBattleIds: battleIds,
    battleRows: (data ?? []) as PublicBattleRecordRow[],
    eventRows: [],
    preferredForceKey,
  })
}

const loadPublicZvzBattleSessionReportCached = unstable_cache(
  loadPublicZvzBattleSessionReportUncached,
  ['public-zvz-battle-session-report'],
  { revalidate: SESSION_REPORT_REVALIDATE_SECONDS },
)

export async function loadPublicZvzBattleSessionReport(input: {
  server: AlbionServer
  battleIds: ReadonlyArray<number>
  preferredForceKey?: string | null
}): Promise<PublicBattleGroupReport | null> {
  const battleIds = [...new Set(input.battleIds)]
    .filter((value) => Number.isSafeInteger(value) && value > 0)
    .slice(0, PUBLIC_ZVZ_SESSION_MAX_BATTLES)
  if (battleIds.length === 0) return null

  return loadPublicZvzBattleSessionReportCached(
    input.server,
    battleIds.join(','),
    String(input.preferredForceKey ?? '').trim(),
  )
}
