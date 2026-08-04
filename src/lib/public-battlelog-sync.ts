import 'server-only'

import { ALBION_SERVERS, type AlbionServer } from '@/lib/albion-gameinfo'
import { fetchRecentBattles, type AlbionBattle } from '@/lib/albion-battles'
import {
  buildBattleForceSummaryRows,
  buildBattleRecordRow,
  type BattleForceSummaryRow,
} from '@/lib/battle-tracking-helpers'
import type { getAdminClient } from '@/lib/supabase-admin'
import {
  backfillPublicZvzProjections,
  projectPublicZvzBattles,
  type PublicZvzProjectionBatchResult,
} from '@/lib/public-zvz-projection-sync'
import { isPublicZvzProjectionCandidate } from '@/lib/public-zvz-ranking-v2'

type SupabaseAdminClient = ReturnType<typeof getAdminClient>

const DEFAULT_PUBLIC_BATTLELOG_PAGES = 3
const FORCE_SUMMARY_UPSERT_CHUNK_SIZE = 1000
const DEFAULT_PUBLIC_ZVZ_PROJECTION_LIMIT_PER_SERVER = 12
const DEFAULT_PUBLIC_ZVZ_BACKFILL_LIMIT = 12

interface BattleRecordIdRow {
  id: string
  albion_battle_id: number | string
}

export interface PublicBattlelogSyncOptions {
  pages?: number
  now?: Date
  projectionLimitPerServer?: number
  backfillLimit?: number
  backfillOnly?: boolean
  refreshRollups?: boolean
}

export interface PublicBattlelogServerResult {
  server: AlbionServer
  battles_fetched: number
  battle_records_upserted: number
  force_summaries_upserted: number
  projection: PublicZvzProjectionBatchResult | null
  errors: string[]
}

export interface PublicBattlelogSyncResult {
  pages: number
  servers: PublicBattlelogServerResult[]
  rollups: unknown[]
  season_rollups: unknown
  season_rollups_v2: unknown
  backfill: (PublicZvzProjectionBatchResult & { remainingCandidateScan: boolean }) | null
}

function clampPages(pages: number | undefined): number {
  if (!Number.isFinite(pages) || typeof pages !== 'number') {
    return DEFAULT_PUBLIC_BATTLELOG_PAGES
  }
  return Math.min(Math.max(Math.trunc(pages), 1), 8)
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function getUtcWeekStartDate(date: Date): Date {
  const weekStart = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ))
  const day = weekStart.getUTCDay()
  const daysSinceMonday = day === 0 ? 6 : day - 1
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday)
  return weekStart
}

export function getUtcWeekStartDateString(date: Date): string {
  return toDateString(getUtcWeekStartDate(date))
}

function getPreviousUtcWeekStartDateString(date: Date): string {
  const current = getUtcWeekStartDate(date)
  current.setUTCDate(current.getUTCDate() - 7)
  return toDateString(current)
}

function battleRecordIdMap(rows: ReadonlyArray<BattleRecordIdRow>): Map<number, string> {
  const out = new Map<number, string>()
  for (const row of rows) {
    const battleId = Number(row.albion_battle_id)
    if (!Number.isFinite(battleId)) continue
    out.set(battleId, row.id)
  }
  return out
}

function chunkRows<T>(rows: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size))
  }
  return chunks
}

function buildForceSummaryRows(
  battles: ReadonlyArray<AlbionBattle>,
  idsByBattleId: ReadonlyMap<number, string>,
): BattleForceSummaryRow[] {
  return battles.flatMap((battle) => {
    const battleRecordId = idsByBattleId.get(battle.id)
    return battleRecordId ? buildBattleForceSummaryRows(battleRecordId, battle) : []
  })
}

async function upsertPublicBattlesForServer(
  db: SupabaseAdminClient,
  server: AlbionServer,
  pages: number,
  projectionLimit: number,
): Promise<PublicBattlelogServerResult> {
  const errors: string[] = []
  let battles: AlbionBattle[] = []
  try {
    battles = await fetchRecentBattles(server, pages)
  } catch (error) {
    return {
      server,
      battles_fetched: 0,
      battle_records_upserted: 0,
      force_summaries_upserted: 0,
      projection: null,
      errors: [`fetchRecentBattles: ${error instanceof Error ? error.message : String(error)}`],
    }
  }

  if (battles.length === 0) {
    return {
      server,
      battles_fetched: 0,
      battle_records_upserted: 0,
      force_summaries_upserted: 0,
      projection: null,
      errors,
    }
  }

  const battleRows = battles.map((battle) => buildBattleRecordRow(battle, server))
  const { data: upserted, error: battleError } = await db
    .from('battle_records')
    .upsert(battleRows, { onConflict: 'albion_server,albion_battle_id' })
    .select('id, albion_battle_id')

  if (battleError) {
    return {
      server,
      battles_fetched: battles.length,
      battle_records_upserted: 0,
      force_summaries_upserted: 0,
      projection: null,
      errors: [`battle_records upsert: ${battleError.message}`],
    }
  }

  const idsByBattleId = battleRecordIdMap((upserted ?? []) as BattleRecordIdRow[])
  const forceRows = buildForceSummaryRows(battles, idsByBattleId)
  let forceSummariesUpserted = 0
  for (const chunk of chunkRows(forceRows, FORCE_SUMMARY_UPSERT_CHUNK_SIZE)) {
    const { error: forceError } = await db
      .from('battle_force_summaries')
      .upsert(chunk, { onConflict: 'battle_record_id,force_level,force_key' })
    if (forceError) {
      errors.push(`battle_force_summaries upsert: ${forceError.message}`)
      continue
    }
    forceSummariesUpserted += chunk.length
  }

  const projectionBattles = battles
    .filter(isPublicZvzProjectionCandidate)
    .slice(0, projectionLimit)
    .flatMap((battle) => {
      const battleRecordId = idsByBattleId.get(battle.id)
      return battleRecordId
        ? [{ battleRecordId, server, battle }]
        : []
    })
  const projection = projectionBattles.length > 0
    ? await projectPublicZvzBattles(db, projectionBattles)
    : null
  if (projection?.errors.length) {
    errors.push(...projection.errors.map((error) => `projection: ${error}`))
  }

  return {
    server,
    battles_fetched: battles.length,
    battle_records_upserted: upserted?.length ?? 0,
    force_summaries_upserted: forceSummariesUpserted,
    projection,
    errors,
  }
}

export async function syncPublicBattlelog(
  db: SupabaseAdminClient,
  options: PublicBattlelogSyncOptions = {},
): Promise<PublicBattlelogSyncResult> {
  const pages = clampPages(options.pages)
  const now = options.now ?? new Date()
  const servers: PublicBattlelogServerResult[] = []
  const projectionLimit = Math.min(
    30,
    Math.max(
      1,
      Math.trunc(
        options.projectionLimitPerServer ?? DEFAULT_PUBLIC_ZVZ_PROJECTION_LIMIT_PER_SERVER,
      ),
    ),
  )

  if (!options.backfillOnly) {
    for (const server of ALBION_SERVERS) {
      servers.push(await upsertPublicBattlesForServer(db, server, pages, projectionLimit))
    }
  }

  const backfillLimit = Math.min(
    100,
    Math.max(1, Math.trunc(options.backfillLimit ?? DEFAULT_PUBLIC_ZVZ_BACKFILL_LIMIT)),
  )
  const backfill = options.backfillLimit === 0
    ? null
    : await backfillPublicZvzProjections(db, backfillLimit)

  const rollupWeekStarts = [
    getUtcWeekStartDateString(now),
    getPreviousUtcWeekStartDateString(now),
  ]
  const rollups: unknown[] = []
  const refreshRollups = options.refreshRollups ?? true
  if (!options.backfillOnly && refreshRollups) {
    for (const weekStart of rollupWeekStarts) {
      const { data, error } = await db.rpc('refresh_guild_weekly_zvz_rollups', {
        p_week_start: weekStart,
      })
      rollups.push(error ? { week_start: weekStart, error: error.message } : data)
    }
  }

  const { data: seasonRollups, error: seasonRollupError } = options.backfillOnly || !refreshRollups
    ? { data: null, error: null }
    : await db.rpc('refresh_current_guild_zvz_season_snapshots')
  const { data: seasonRollupsV2, error: seasonRollupV2Error } = refreshRollups
    ? await db.rpc('refresh_current_public_zvz_v2_season_snapshots')
    : { data: null, error: null }

  return {
    pages,
    servers,
    rollups,
    season_rollups: seasonRollupError
      ? { error: seasonRollupError.message }
      : seasonRollups,
    season_rollups_v2: seasonRollupV2Error
      ? { error: seasonRollupV2Error.message }
      : seasonRollupsV2,
    backfill,
  }
}
