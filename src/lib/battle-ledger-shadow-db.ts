import 'server-only'

import type { AlbionServer } from './albion-gameinfo'
import type { AlbionBattle } from './albion-battles'
import {
  buildBattleLedgerShadowRows,
  buildGuildBattleViewProjections,
  type BattleLedgerRegistryEntityRow,
  type BattleLedgerRegistryNameRow,
  type BattleParticipantSnapshotRow,
  type BattleRecordSnapshotRow,
  type GuildBattleViewProjectionRow,
} from './battle-ledger-shadow'

interface SupabaseWriteClient {
  from: (table: string) => {
    upsert: (
      rows: unknown,
      options?: { onConflict?: string; ignoreDuplicates?: boolean },
    ) => PromiseLike<{ error: { message: string } | null }>
  }
}

export interface BattleLedgerShadowTenant {
  tenantId: string
  homeGuildId: string
  homeGuildName: string
  homeAllianceId: string | null
}

export interface UpsertBattleLedgerShadowInput {
  db: SupabaseWriteClient
  server: AlbionServer
  battles: AlbionBattle[]
  battleRecordIdMap: Map<number, string>
  tenants: BattleLedgerShadowTenant[]
  fetchedAt: string
}

export interface UpsertBattleLedgerShadowResult {
  registryEntities: number
  registryNames: number
  snapshots: number
  participants: number
  projections: number
  errors: string[]
}

function entityToDb(row: BattleLedgerRegistryEntityRow): Record<string, unknown> {
  return {
    albion_server: row.albionServer,
    entity_type: row.entityType,
    albion_id: row.albionId,
    current_name: row.currentName,
    current_tag: row.currentTag,
    source: row.source,
    last_seen_at: row.lastSeenAt,
    updated_at: row.lastSeenAt,
  }
}

function nameToDb(row: BattleLedgerRegistryNameRow): Record<string, unknown> {
  return {
    albion_server: row.albionServer,
    entity_type: row.entityType,
    albion_id: row.albionId,
    name: row.name,
    tag: row.tag,
    source: row.source,
    last_seen_at: row.lastSeenAt,
  }
}

function snapshotToDb(row: BattleRecordSnapshotRow): Record<string, unknown> {
  return {
    battle_record_id: row.battleRecordId,
    raw_hash: row.rawHash,
    fetched_at: row.fetchedAt,
    summary: row.summary,
  }
}

function participantToDb(row: BattleParticipantSnapshotRow): Record<string, unknown> {
  return {
    battle_record_id: row.battleRecordId,
    participant_type: row.participantType,
    entity_albion_id: row.entityAlbionId,
    entity_name: row.entityName,
    guild_albion_id: row.guildAlbionId,
    guild_name: row.guildName,
    alliance_albion_id: row.allianceAlbionId,
    alliance_name: row.allianceName,
    team_size: row.teamSize,
    kills: row.kills,
    deaths: row.deaths,
    kill_fame: row.killFame,
    updated_at: new Date().toISOString(),
  }
}

function projectionToDb(row: GuildBattleViewProjectionRow): Record<string, unknown> {
  return {
    battle_record_id: row.battleRecordId,
    subject_type: row.subjectType,
    subject_albion_id: row.subjectAlbionId,
    subject_name: row.subjectName,
    subject_alliance_id: row.subjectAllianceId,
    subject_alliance_name: row.subjectAllianceName,
    relation_scope: row.relationScope,
    opponent_force_key: row.opponentForceKey,
    opponent_force_kind: row.opponentForceKind,
    opponent_force_albion_id: row.opponentForceAlbionId,
    opponent_force_name: row.opponentForceName,
    opponent_alliance_id: row.opponentAllianceId,
    subject_team_size: row.subjectTeamSize,
    subject_kills: row.subjectKills,
    subject_deaths: row.subjectDeaths,
    subject_kill_fame: row.subjectKillFame,
    opponent_team_size: row.opponentTeamSize,
    opponent_kills: row.opponentKills,
    opponent_deaths: row.opponentDeaths,
    opponent_kill_fame: row.opponentKillFame,
    status: row.status,
    evidence_source: row.evidenceSource,
    is_meaningful: row.isMeaningful,
    view_policy: row.viewPolicy,
    result_estimate: row.resultEstimate,
    size_category: row.sizeCategory,
    legacy_outcome: row.legacyOutcome,
    evaluated_at: row.evaluatedAt,
    updated_at: row.evaluatedAt,
  }
}

async function upsertRows(
  db: SupabaseWriteClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  errors: string[],
  options: { ignoreDuplicates?: boolean } = {},
): Promise<number> {
  if (rows.length === 0) return 0
  const { error } = await db.from(table).upsert(rows, {
    onConflict,
    ignoreDuplicates: options.ignoreDuplicates,
  })
  if (error) {
    errors.push(`${table} upsert: ${error.message}`)
    return 0
  }
  return rows.length
}

function dedupeRows<T>(
  rows: T[],
  keyFn: (row: T) => string,
): T[] {
  return [...new Map(rows.map((row) => [keyFn(row), row])).values()]
}

export async function upsertBattleLedgerShadow(
  input: UpsertBattleLedgerShadowInput,
): Promise<UpsertBattleLedgerShadowResult> {
  const errors: string[] = []
  const registryEntities: BattleLedgerRegistryEntityRow[] = []
  const registryNames: BattleLedgerRegistryNameRow[] = []
  const snapshots: BattleRecordSnapshotRow[] = []
  const participants: BattleParticipantSnapshotRow[] = []
  const projections: GuildBattleViewProjectionRow[] = []

  for (const battle of input.battles) {
    const battleRecordId = input.battleRecordIdMap.get(battle.id)
    if (!battleRecordId) continue

    const rows = buildBattleLedgerShadowRows({
      battleRecordId,
      server: input.server,
      battle,
      fetchedAt: input.fetchedAt,
    })
    registryEntities.push(...rows.registryEntities)
    registryNames.push(...rows.registryNames)
    snapshots.push(rows.snapshot)
    participants.push(...rows.participants)

    for (const tenant of input.tenants) {
      projections.push(
        ...buildGuildBattleViewProjections({
          battleRecordId,
          battle,
          subjectGuildId: tenant.homeGuildId,
          subjectGuildName: tenant.homeGuildName,
          subjectAllianceId: tenant.homeAllianceId,
          evaluatedAt: input.fetchedAt,
        }),
      )
    }
  }

  const entityRows = dedupeRows(
    registryEntities,
    (row) => `${row.albionServer}:${row.entityType}:${row.albionId}`,
  ).map(entityToDb)
  const nameRows = dedupeRows(
    registryNames,
    (row) => `${row.albionServer}:${row.entityType}:${row.albionId}:${row.name}`,
  ).map(nameToDb)
  const snapshotRows = dedupeRows(
    snapshots,
    (row) => `${row.battleRecordId}:${row.rawHash}`,
  ).map(snapshotToDb)
  const participantRows = dedupeRows(
    participants,
    (row) => `${row.battleRecordId}:${row.participantType}:${row.entityAlbionId}`,
  ).map(participantToDb)
  const projectionRows = dedupeRows(
    projections,
    (row) =>
      [
        row.battleRecordId,
        row.subjectType,
        row.subjectAlbionId,
        row.relationScope,
        row.opponentForceKey,
      ].join(':'),
  ).map(projectionToDb)

  const registryEntitiesCount = await upsertRows(
    input.db,
    'albion_registry_entities',
    entityRows,
    'albion_server,entity_type,albion_id',
    errors,
  )
  const registryNamesCount = await upsertRows(
    input.db,
    'albion_registry_entity_names',
    nameRows,
    'albion_server,entity_type,albion_id,name',
    errors,
  )
  const snapshotsCount = await upsertRows(
    input.db,
    'battle_record_snapshots',
    snapshotRows,
    'battle_record_id,raw_hash',
    errors,
    { ignoreDuplicates: true },
  )
  const participantsCount = await upsertRows(
    input.db,
    'battle_participant_snapshots',
    participantRows,
    'battle_record_id,participant_type,entity_albion_id',
    errors,
  )
  const projectionsCount = await upsertRows(
    input.db,
    'battle_view_projections',
    projectionRows,
    'battle_record_id,subject_type,subject_albion_id,relation_scope,opponent_force_key',
    errors,
  )

  return {
    registryEntities: registryEntitiesCount,
    registryNames: registryNamesCount,
    snapshots: snapshotsCount,
    participants: participantsCount,
    projections: projectionsCount,
    errors,
  }
}
