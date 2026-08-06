import 'server-only'

import type { AlbionServer } from '@/lib/albion-gameinfo'
import { parseRawBattle, type AlbionBattle } from '@/lib/albion-battles'
import { hashBattleEngagementSource } from '@/lib/battle-engagements'
import { loadPublicBattleRawEventBatch } from '@/lib/public-battle-analysis'
import { normalizePublicBattleProjectionEvents } from '@/lib/public-battle-analysis-model'
import {
  buildPublicZvzBattleProjection,
  isPublicZvzProjectionCandidate,
  type PublicZvzProjectionCoverage,
} from '@/lib/public-zvz-ranking-v2'
import type { getAdminClient } from '@/lib/supabase-admin'

type SupabaseAdminClient = ReturnType<typeof getAdminClient>

const PROJECTION_CONCURRENCY = 4

export interface PublicZvzProjectionBattle {
  battleRecordId: string
  server: AlbionServer
  battle: AlbionBattle
}

export interface PublicZvzProjectionResult {
  battleRecordId: string
  albionBattleId: number
  candidate: boolean
  coverage: PublicZvzProjectionCoverage
  observedEvents: number
  expectedEvents: number
  engagements: number
  finalEngagements: number
  error: string | null
}

export interface PublicZvzProjectionBatchResult {
  attempted: number
  projected: number
  finalEngagements: number
  partial: number
  errors: string[]
  results: PublicZvzProjectionResult[]
}

function coverageForBatch(input: {
  expected: number
  observed: number
  failedPages: number
  truncated: boolean
}): PublicZvzProjectionCoverage {
  if (input.expected === 0 && input.failedPages === 0 && !input.truncated) {
    return 'complete'
  }
  if (input.observed === 0 && input.expected > 0) return 'unavailable'
  if (
    input.failedPages > 0 ||
    input.truncated ||
    input.observed < input.expected
  ) {
    return 'partial'
  }
  return 'complete'
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length)
  let next = 0

  async function run(): Promise<void> {
    while (next < values.length) {
      const index = next
      next += 1
      output[index] = await worker(values[index])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => run()),
  )
  return output
}

async function projectBattle(
  db: SupabaseAdminClient,
  input: PublicZvzProjectionBattle,
): Promise<PublicZvzProjectionResult> {
  const sourceHash = hashBattleEngagementSource(input.battle)
  const candidate = isPublicZvzProjectionCandidate(input.battle)
  const expectedEvents = Math.max(0, Math.floor(input.battle.totalKills ?? 0))

  try {
    const batch = candidate
      ? await loadPublicBattleRawEventBatch({
          server: input.server,
          battleId: input.battle.id,
          totalKills: expectedEvents,
        })
      : {
          battleId: input.battle.id,
          events: [] as unknown[],
          failedPageOffsets: [] as number[],
          truncated: false,
        }
    const events = normalizePublicBattleProjectionEvents(
      input.battle.id,
      batch.events,
    )
    const coverage: PublicZvzProjectionCoverage = candidate
      ? coverageForBatch({
          expected: expectedEvents,
          observed: events.length,
          failedPages: batch.failedPageOffsets?.length ?? 0,
          truncated: batch.truncated ?? false,
        })
      : 'complete'
    const projection = buildPublicZvzBattleProjection({
      battle: input.battle,
      events,
      coverage,
      sourceHash,
    })
    const { error } = await db.rpc('replace_public_zvz_battle_projection', {
      p_battle_record_id: input.battleRecordId,
      p_source_hash: sourceHash,
      p_coverage: coverage,
      p_is_candidate: candidate,
      p_observed_event_count: events.length,
      p_expected_event_count: expectedEvents,
      p_engagements: projection.engagements,
    })
    if (error) throw new Error(error.message)
    const { error: itemPowerError } = await db.rpc(
      'apply_public_zvz_battle_item_power',
      {
        p_battle_record_id: input.battleRecordId,
        p_source_hash: sourceHash,
        p_engagements: projection.engagements,
      },
    )
    if (itemPowerError) throw new Error(itemPowerError.message)

    return {
      battleRecordId: input.battleRecordId,
      albionBattleId: input.battle.id,
      candidate,
      coverage,
      observedEvents: events.length,
      expectedEvents,
      engagements: projection.engagements.length,
      finalEngagements: projection.engagements.filter(
        (engagement) => engagement.status === 'final',
      ).length,
      error: null,
    }
  } catch (error) {
    return {
      battleRecordId: input.battleRecordId,
      albionBattleId: input.battle.id,
      candidate,
      coverage: 'unavailable',
      observedEvents: 0,
      expectedEvents,
      engagements: 0,
      finalEngagements: 0,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function projectPublicZvzBattles(
  db: SupabaseAdminClient,
  battles: readonly PublicZvzProjectionBattle[],
): Promise<PublicZvzProjectionBatchResult> {
  const results = await mapWithConcurrency(
    battles,
    PROJECTION_CONCURRENCY,
    (battle) => projectBattle(db, battle),
  )
  return {
    attempted: results.length,
    projected: results.filter((result) => result.error === null).length,
    finalEngagements: results.reduce(
      (sum, result) => sum + result.finalEngagements,
      0,
    ),
    partial: results.filter(
      (result) => result.error === null && result.coverage !== 'complete',
    ).length,
    errors: results.flatMap((result) => (
      result.error
        ? [`battle ${result.albionBattleId}: ${result.error}`]
        : []
    )),
    results,
  }
}

export async function loadPublicZvzBackfillCandidates(
  db: SupabaseAdminClient,
  limit: number,
): Promise<PublicZvzProjectionBattle[]> {
  const boundedLimit = Math.min(100, Math.max(1, Math.trunc(limit)))
  const { data, error } = await db.rpc(
    'list_public_zvz_projection_backfill_candidates',
    { p_limit: boundedLimit },
  )
  if (error) throw new Error(`v2 backfill candidate query failed: ${error.message}`)

  const candidates: PublicZvzProjectionBattle[] = []
  for (const rawRow of data ?? []) {
    const row = rawRow as {
      battle_record_id: string
      albion_server: AlbionServer
      raw_battle: unknown
      engagement_source_hash: string | null
    }
    const battle = parseRawBattle(row.raw_battle)
    if (!battle) continue
    candidates.push({
      battleRecordId: row.battle_record_id,
      server: row.albion_server,
      battle,
    })
    if (candidates.length >= boundedLimit) break
  }
  return candidates
}

export async function backfillPublicZvzProjections(
  db: SupabaseAdminClient,
  limit: number,
): Promise<PublicZvzProjectionBatchResult & { remainingCandidateScan: boolean }> {
  const candidates = await loadPublicZvzBackfillCandidates(db, limit)
  const result = await projectPublicZvzBattles(db, candidates)
  return {
    ...result,
    remainingCandidateScan: candidates.length >= Math.min(100, Math.max(1, Math.trunc(limit))),
  }
}
