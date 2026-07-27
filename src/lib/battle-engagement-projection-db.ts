import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AlbionBattle } from '@/lib/albion-battles'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import { syncBattleEvidenceFastLane } from '@/lib/battle-evidence-fast-lane'
import {
  buildBattleEngagementProjection,
  hashBattleEngagementSource,
  type BattleEngagementEventEvidence,
  type BattleEngagementProjectionRun,
} from '@/lib/battle-engagements'

export interface BattleEngagementProjectionTenant {
  tenantId: string
  homeGuildId: string
}

export interface RefreshBattleEngagementProjectionsInput {
  db: SupabaseClient
  battles: ReadonlyArray<AlbionBattle>
  battleRecordIdMap: ReadonlyMap<number, string>
  tenants: ReadonlyArray<BattleEngagementProjectionTenant>
  evaluatedAt: string
  server?: AlbionServer
  fastLaneLimit?: number
}

export interface PendingBattleEngagementProjection {
  tenantId: string
  homeGuildId: string
  battleRecordId: string
  albionBattleId: number
  state: BattleEngagementProjectionRun['state']
  reason: BattleEngagementProjectionRun['reason']
}

export interface RefreshBattleEngagementProjectionsResult {
  observedSources: number
  sourceChanges: number
  publishedRuns: number
  publishedEngagements: number
  fastLaneAttempts: number
  fastLaneRowsUpserted: number
  pending: PendingBattleEngagementProjection[]
  warnings: string[]
  errors: string[]
}

interface ObservationRow {
  observed_source_hash: string
  consecutive_observations: number
  source_changed: boolean
}

interface KillboardEvidenceDbRow {
  event_id: number | string
  guild_id: string
  battle_id: number | string | null
  role: 'killer' | 'victim'
  albion_player_id: string | null
  source_guild_id: string | null
  source_alliance_id: string | null
  opponent_guild_id: string | null
  opponent_guild: string | null
  opponent_alliance_id: string | null
  opponent_alliance: string | null
  fame: number | string | null
  fame_is_observed: boolean
  occurred_at: string
}

function battleKey(value: number | string | null): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? String(value) : null
  }
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) return null
  return String(BigInt(value.trim()))
}

function nonNegativeInteger(value: number | string | null): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0)
  if (!Number.isSafeInteger(parsed) || parsed < 0) return -1
  return parsed
}

function firstObservationRow(data: unknown): ObservationRow | null {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') return null
  const record = row as Record<string, unknown>
  if (
    typeof record.observed_source_hash !== 'string' ||
    typeof record.consecutive_observations !== 'number' ||
    typeof record.source_changed !== 'boolean'
  ) {
    return null
  }
  return record as unknown as ObservationRow
}

function toEvidence(row: KillboardEvidenceDbRow): BattleEngagementEventEvidence {
  return {
    eventId: String(row.event_id),
    battleId: row.battle_id,
    role: row.role,
    sourcePlayerId: row.albion_player_id,
    sourceGuildId: row.source_guild_id,
    sourceAllianceId: row.source_alliance_id,
    opponentGuildId: row.opponent_guild_id,
    opponentGuildName: row.opponent_guild,
    opponentAllianceId: row.opponent_alliance_id,
    opponentAllianceName: row.opponent_alliance,
    fame: nonNegativeInteger(row.fame),
    fameIsObserved: row.fame_is_observed === true,
    occurredAt: row.occurred_at,
  }
}

export async function refreshBattleEngagementProjections(
  input: RefreshBattleEngagementProjectionsInput,
): Promise<RefreshBattleEngagementProjectionsResult> {
  const result: RefreshBattleEngagementProjectionsResult = {
    observedSources: 0,
    sourceChanges: 0,
    publishedRuns: 0,
    publishedEngagements: 0,
    fastLaneAttempts: 0,
    fastLaneRowsUpserted: 0,
    pending: [],
    warnings: [],
    errors: [],
  }
  if (
    input.battles.length === 0 ||
    input.battleRecordIdMap.size === 0 ||
    input.tenants.length === 0
  ) {
    return result
  }

  const observationByBattleId = new Map<number, ObservationRow>()
  // 같은 fetch batch 안의 중복 battle은 한 번의 원본 관측으로만 센다.
  // DB도 이 token을 저장해 재시도/중복 호출이 안정성 2회 조건을 우회하지 못한다.
  const observationToken = randomUUID()
  let fastLaneAttempts = 0
  const fastLaneLimit = Math.max(0, Math.floor(input.fastLaneLimit ?? 0))
  for (const battle of input.battles) {
    const battleRecordId = input.battleRecordIdMap.get(battle.id)
    if (!battleRecordId) continue
    const sourceHash = hashBattleEngagementSource(battle)
    const { data, error } = await input.db.rpc('observe_battle_engagement_source', {
      p_battle_record_id: battleRecordId,
      p_source_hash: sourceHash,
      p_observed_at: input.evaluatedAt,
      p_observation_token: observationToken,
    })
    if (error) {
      result.errors.push(
        `engagement source observation (battle ${battle.id}): ${error.message}`,
      )
      continue
    }
    const observation = firstObservationRow(data)
    if (!observation || observation.observed_source_hash !== sourceHash) {
      result.errors.push(
        `engagement source observation (battle ${battle.id}): invalid response`,
      )
      continue
    }
    observationByBattleId.set(battle.id, observation)
    result.observedSources += 1
    if (observation.source_changed) result.sourceChanges += 1
  }

  const tenantIds = [...new Set(input.tenants.map((tenant) => tenant.tenantId))]
  const battleIds = [...observationByBattleId.keys()]
  const evidenceByTenantBattle = new Map<string, BattleEngagementEventEvidence[]>()
  if (tenantIds.length > 0 && battleIds.length > 0) {
    const { data, error } = await input.db
      .from('killboard_events')
      .select(
        'event_id, guild_id, battle_id, role, albion_player_id, source_guild_id, source_alliance_id, opponent_guild_id, opponent_guild, opponent_alliance_id, opponent_alliance, fame, fame_is_observed, occurred_at',
      )
      .in('guild_id', tenantIds)
      .in('battle_id', battleIds)
    if (error) {
      result.errors.push(`engagement evidence query: ${error.message}`)
      return result
    }

    for (const row of (data ?? []) as KillboardEvidenceDbRow[]) {
      const normalizedBattleId = battleKey(row.battle_id)
      if (!normalizedBattleId) continue
      const key = `${row.guild_id}:${normalizedBattleId}`
      const evidence = evidenceByTenantBattle.get(key) ?? []
      evidence.push(toEvidence(row))
      evidenceByTenantBattle.set(key, evidence)
    }
  }

  for (const battle of input.battles) {
    const battleRecordId = input.battleRecordIdMap.get(battle.id)
    const observation = observationByBattleId.get(battle.id)
    if (!battleRecordId || !observation) continue

    for (const tenant of input.tenants) {
      if (!battle.guilds?.[tenant.homeGuildId]) continue
      let evidence =
        evidenceByTenantBattle.get(`${tenant.tenantId}:${battleKey(battle.id)}`) ?? []
      let projection = buildBattleEngagementProjection({
        battle,
        homeGuildId: tenant.homeGuildId,
        events: evidence,
        sourceObservationCount: observation.consecutive_observations,
        evaluatedAt: input.evaluatedAt,
      })
      const evidenceIncomplete =
        projection.collectedHomeKills !== projection.rawHomeKills ||
        projection.collectedHomeDeaths !== projection.rawHomeDeaths
      if (
        evidenceIncomplete &&
        input.server &&
        fastLaneAttempts < fastLaneLimit
      ) {
        fastLaneAttempts += 1
        result.fastLaneAttempts += 1
        const fastLane = await syncBattleEvidenceFastLane({
          db: input.db,
          server: input.server,
          guildId: tenant.tenantId,
          homeGuildId: tenant.homeGuildId,
          battle,
        })
        result.fastLaneRowsUpserted += fastLane.rowsUpserted
        result.warnings.push(...fastLane.warnings)
        result.warnings.push(...fastLane.errors)

        const { data: refreshedRows, error: refreshedError } = await input.db
          .from('killboard_events')
          .select(
            'event_id, guild_id, battle_id, role, albion_player_id, source_guild_id, source_alliance_id, opponent_guild_id, opponent_guild, opponent_alliance_id, opponent_alliance, fame, fame_is_observed, occurred_at',
          )
          .eq('guild_id', tenant.tenantId)
          .eq('battle_id', battle.id)
        if (refreshedError) {
          result.warnings.push(
            `engagement evidence refresh (battle ${battle.id}): ${refreshedError.message}`,
          )
        } else {
          evidence = ((refreshedRows ?? []) as KillboardEvidenceDbRow[]).map(toEvidence)
          projection = buildBattleEngagementProjection({
            battle,
            homeGuildId: tenant.homeGuildId,
            events: evidence,
            sourceObservationCount: observation.consecutive_observations,
            evaluatedAt: input.evaluatedAt,
          })
        }
      }
      const { error } = await input.db.rpc('publish_battle_engagement_projection', {
        p_guild_id: tenant.tenantId,
        p_battle_record_id: battleRecordId,
        p_home_guild_id: tenant.homeGuildId,
        p_source_hash: projection.sourceHash,
        p_projection: projection,
      })
      if (error) {
        result.errors.push(
          `engagement projection publish (tenant ${tenant.tenantId}, battle ${battle.id}): ${error.message}`,
        )
        continue
      }
      result.publishedRuns += 1
      result.publishedEngagements += projection.engagements.length
      if (projection.state !== 'ready') {
        result.pending.push({
          tenantId: tenant.tenantId,
          homeGuildId: tenant.homeGuildId,
          battleRecordId,
          albionBattleId: battle.id,
          state: projection.state,
          reason: projection.reason,
        })
      }
    }
  }

  return result
}
