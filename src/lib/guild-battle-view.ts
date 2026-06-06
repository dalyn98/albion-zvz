import type {
  BattleProjectionEvidenceSource,
  BattleProjectionStatus,
  BattleRelationScope,
  BattleResultEstimate,
  BattleViewPolicy,
} from './battle-ledger-shadow'
import type {
  BattleActivityKind,
  BattleActivitySource,
} from './battle-activity-classification'
import type { AlbionServer } from './albion-gameinfo'
import { categorizeSize, type Outcome, type SizeCategory } from './albion-battles'

export const GUILD_BATTLE_LIST_MODES = [
  'default',
  'direct',
  'alliance',
  'excluded',
  'diffs',
] as const

export type GuildBattleListMode = (typeof GUILD_BATTLE_LIST_MODES)[number]

export const GUILD_BATTLE_RESULT_ESTIMATES = [
  'advantage',
  'disadvantage',
  'even',
  'unclear',
] as const

export type GuildBattleResultFilter = (typeof GUILD_BATTLE_RESULT_ESTIMATES)[number]

export interface GuildBattleViewDbRow {
  id: string
  tenant_id: string
  battle_record_id: string
  legacy_tenant_battle_record_id: string | null
  albion_server: AlbionServer
  albion_battle_id: number
  started_at: string
  ended_at: string
  cluster_name: string | null
  subject_name: string
  subject_alliance_name: string | null
  relation_scope: BattleRelationScope
  opponent_force_kind: 'guild' | 'alliance'
  opponent_force_name: string
  subject_team_size: number
  subject_kills: number
  subject_deaths: number
  subject_kill_fame: number
  opponent_team_size: number
  opponent_kills: number
  opponent_deaths: number
  opponent_kill_fame: number
  status: BattleProjectionStatus
  evidence_source: BattleProjectionEvidenceSource
  is_meaningful: boolean
  view_policy: BattleViewPolicy
  activity_kind: BattleActivityKind
  activity_source: BattleActivitySource
  activity_reason: string
  automatic_activity_kind: BattleActivityKind
  automatic_activity_reason: string
  result_estimate: BattleResultEstimate
  size_category: SizeCategory | null
  legacy_outcome: Outcome | null
  legacy_row_outcome: Outcome | null
  legacy_is_provisional: boolean | null
  match_index: number | null
  match_total: number | null
  has_active_diff: boolean
  active_diff_types: string[]
  evaluated_at: string
}

export interface GuildBattleListRow {
  id: string
  battleRecordId: string
  legacyTenantBattleRecordId: string | null
  albionBattleId: number
  clusterName: string | null
  startedAt: string
  subjectName: string
  subjectAllianceName: string | null
  relationScope: BattleRelationScope
  opponentForceKind: 'guild' | 'alliance'
  opponentForceName: string
  subjectTeamSize: number
  subjectKills: number
  subjectDeaths: number
  subjectKillFame: number
  opponentTeamSize: number
  opponentKills: number
  opponentDeaths: number
  opponentKillFame: number
  status: BattleProjectionStatus
  evidenceSource: BattleProjectionEvidenceSource
  isMeaningful: boolean
  viewPolicy: BattleViewPolicy
  activityKind: BattleActivityKind
  activitySource: BattleActivitySource
  activityReason: string
  automaticActivityKind: BattleActivityKind
  automaticActivityReason: string
  resultEstimate: BattleResultEstimate
  sizeCategory: SizeCategory | null
  legacyOutcome: Outcome | null
  legacyRowOutcome: Outcome | null
  legacyIsProvisional: boolean
  matchIndex: number
  matchTotal: number
  hasActiveDiff: boolean
  activeDiffTypes: string[]
  evaluatedAt: string
}

export interface GuildBattleListGroup {
  key: string
  id: string
  battleRecordId: string
  primaryRow: GuildBattleListRow
  rows: GuildBattleListRow[]
  albionBattleId: number
  clusterName: string | null
  startedAt: string
  subjectName: string
  subjectAllianceName: string | null
  relationScope: BattleRelationScope
  subjectTeamSize: number
  subjectKills: number
  subjectDeaths: number
  subjectKillFame: number
  opponentTeamSize: number
  opponentKillFame: number
  opponentForceNames: string[]
  status: BattleProjectionStatus
  evidenceSource: BattleProjectionEvidenceSource
  viewPolicy: BattleViewPolicy
  activityKind: BattleActivityKind
  activitySource: BattleActivitySource
  activityReason: string
  resultEstimate: BattleResultEstimate
  sizeCategory: SizeCategory | null
  hasActiveDiff: boolean
  hasLedgerOnlyRows: boolean
  matchupCount: number
}

export function normalizeGuildBattleListMode(raw: unknown): GuildBattleListMode {
  return GUILD_BATTLE_LIST_MODES.includes(raw as GuildBattleListMode)
    ? (raw as GuildBattleListMode)
    : 'default'
}

export function normalizeGuildBattleResultFilter(
  raw: unknown,
): GuildBattleResultFilter | null {
  return GUILD_BATTLE_RESULT_ESTIMATES.includes(raw as GuildBattleResultFilter)
    ? (raw as GuildBattleResultFilter)
    : null
}

export function resolveGuildBattleDisplayStatus(
  projectionStatus: BattleProjectionStatus,
  legacyIsProvisional: boolean | null,
): BattleProjectionStatus {
  if (projectionStatus === 'low_confidence') return 'low_confidence'
  if (legacyIsProvisional === true) return 'provisional'
  return 'final'
}

export function toGuildBattleListRow(row: GuildBattleViewDbRow): GuildBattleListRow {
  return {
    id: row.id,
    battleRecordId: row.battle_record_id,
    legacyTenantBattleRecordId: row.legacy_tenant_battle_record_id,
    albionBattleId: row.albion_battle_id,
    clusterName: row.cluster_name,
    startedAt: row.started_at,
    subjectName: row.subject_name,
    subjectAllianceName: row.subject_alliance_name,
    relationScope: row.relation_scope,
    opponentForceKind: row.opponent_force_kind,
    opponentForceName: row.opponent_force_name,
    subjectTeamSize: row.subject_team_size,
    subjectKills: row.subject_kills,
    subjectDeaths: row.subject_deaths,
    subjectKillFame: row.subject_kill_fame,
    opponentTeamSize: row.opponent_team_size,
    opponentKills: row.opponent_kills,
    opponentDeaths: row.opponent_deaths,
    opponentKillFame: row.opponent_kill_fame,
    status: resolveGuildBattleDisplayStatus(row.status, row.legacy_is_provisional),
    evidenceSource: row.evidence_source,
    isMeaningful: row.is_meaningful,
    viewPolicy: row.view_policy,
    activityKind: row.activity_kind,
    activitySource: row.activity_source,
    activityReason: row.activity_reason,
    automaticActivityKind: row.automatic_activity_kind,
    automaticActivityReason: row.automatic_activity_reason,
    resultEstimate: row.result_estimate,
    sizeCategory: row.size_category,
    legacyOutcome: row.legacy_outcome,
    legacyRowOutcome: row.legacy_row_outcome,
    legacyIsProvisional: row.legacy_is_provisional ?? false,
    matchIndex: row.match_index ?? 1,
    matchTotal: row.match_total ?? 1,
    hasActiveDiff: row.has_active_diff,
    activeDiffTypes: row.active_diff_types,
    evaluatedAt: row.evaluated_at,
  }
}

function comparePrimaryRows(a: GuildBattleListRow, b: GuildBattleListRow): number {
  if (b.opponentTeamSize !== a.opponentTeamSize) {
    return b.opponentTeamSize - a.opponentTeamSize
  }
  if (b.opponentKillFame !== a.opponentKillFame) {
    return b.opponentKillFame - a.opponentKillFame
  }
  return a.id.localeCompare(b.id)
}

function estimateGroupedResult(
  subjectKillFame: number,
  opponentKillFame: number,
): BattleResultEstimate {
  if (subjectKillFame === 0 && opponentKillFame === 0) return 'unclear'
  if (subjectKillFame > opponentKillFame) return 'advantage'
  if (subjectKillFame < opponentKillFame) return 'disadvantage'
  return 'even'
}

function resolveGroupedStatus(
  rows: ReadonlyArray<GuildBattleListRow>,
): BattleProjectionStatus {
  if (rows.some((row) => row.status === 'low_confidence')) return 'low_confidence'
  if (rows.some((row) => row.status === 'provisional')) return 'provisional'
  return 'final'
}

function uniqueValues(values: ReadonlyArray<string>): string[] {
  return [...new Set(values)]
}

function toGuildBattleListGroup(
  key: string,
  rows: ReadonlyArray<GuildBattleListRow>,
): GuildBattleListGroup {
  const sorted = [...rows].sort(comparePrimaryRows)
  const primaryRow = sorted[0]
  const subjectTeamSize = Math.max(...sorted.map((row) => row.subjectTeamSize))
  const subjectKills = Math.max(...sorted.map((row) => row.subjectKills))
  const subjectDeaths = Math.max(...sorted.map((row) => row.subjectDeaths))
  const subjectKillFame = Math.max(...sorted.map((row) => row.subjectKillFame))
  const opponentTeamSize = sorted.reduce((sum, row) => sum + row.opponentTeamSize, 0)
  const opponentKillFame = sorted.reduce((sum, row) => sum + row.opponentKillFame, 0)
  const sizeCategory =
    categorizeSize(Math.max(subjectTeamSize, opponentTeamSize)) ?? primaryRow.sizeCategory

  return {
    key,
    id: primaryRow.id,
    battleRecordId: primaryRow.battleRecordId,
    primaryRow,
    rows: sorted,
    albionBattleId: primaryRow.albionBattleId,
    clusterName: primaryRow.clusterName,
    startedAt: primaryRow.startedAt,
    subjectName: primaryRow.subjectName,
    subjectAllianceName: primaryRow.subjectAllianceName,
    relationScope: primaryRow.relationScope,
    subjectTeamSize,
    subjectKills,
    subjectDeaths,
    subjectKillFame,
    opponentTeamSize,
    opponentKillFame,
    opponentForceNames: uniqueValues(sorted.map((row) => row.opponentForceName)),
    status: resolveGroupedStatus(sorted),
    evidenceSource: primaryRow.evidenceSource,
    viewPolicy: sorted.some((row) => row.viewPolicy === 'default_meaningful')
      ? 'default_meaningful'
      : 'small_or_low_engagement',
    activityKind: sorted.some((row) => row.activityKind === 'zvz')
      ? 'zvz'
      : primaryRow.activityKind,
    activitySource: sorted.some((row) => row.activitySource === 'manual')
      ? 'manual'
      : sorted.some((row) => row.activitySource === 'event_intent')
        ? 'event_intent'
        : 'automatic',
    activityReason: primaryRow.activityReason,
    resultEstimate: estimateGroupedResult(subjectKillFame, opponentKillFame),
    sizeCategory,
    hasActiveDiff: sorted.some((row) => row.hasActiveDiff),
    hasLedgerOnlyRows: sorted.some((row) => !row.legacyTenantBattleRecordId),
    matchupCount: sorted.length,
  }
}

export function groupGuildBattleListRows(
  rows: ReadonlyArray<GuildBattleListRow>,
  limit = rows.length,
): GuildBattleListGroup[] {
  const groups = new Map<string, GuildBattleListRow[]>()
  const order: string[] = []

  for (const row of rows) {
    const key = `${row.battleRecordId}:${row.relationScope}`
    const current = groups.get(key)
    if (current) {
      current.push(row)
    } else {
      groups.set(key, [row])
      order.push(key)
    }
  }

  return order
    .map((key) => toGuildBattleListGroup(key, groups.get(key) ?? []))
    .slice(0, limit)
}
