import type {
  BattleProjectionEvidenceSource,
  BattleProjectionStatus,
  BattleRelationScope,
  BattleResultEstimate,
  BattleViewPolicy,
} from './battle-ledger-shadow'
import type { AlbionServer } from './albion-gameinfo'
import type { Outcome, SizeCategory } from './albion-battles'

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

export function toGuildBattleListRow(row: GuildBattleViewDbRow): GuildBattleListRow {
  return {
    id: row.id,
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
    status: row.status,
    evidenceSource: row.evidence_source,
    isMeaningful: row.is_meaningful,
    viewPolicy: row.view_policy,
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
