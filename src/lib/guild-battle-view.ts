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

export const GUILD_BATTLE_SESSION_GAP_MS = 45 * 60 * 1000

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
  total_players: number | null
  total_kills: number | null
  total_fame: number | string | null
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
  albionServer: AlbionServer
  albionBattleId: number
  clusterName: string | null
  startedAt: string
  endedAt: string
  totalPlayers: number
  totalKills: number
  totalFame: number
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
  albionServer: AlbionServer
  albionBattleId: number
  clusterName: string | null
  startedAt: string
  endedAt: string
  totalPlayers: number
  totalKills: number
  totalFame: number
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

export interface GuildBattleSessionForceLine {
  key: string
  name: string
  forceKind: 'alliance' | 'guild'
  side: 'subject' | 'opponent'
  teamSize: number
  kills: number
  deaths: number
  killFame: number
  battleCount: number
  highlighted: boolean
}

export interface GuildBattleSessionGroup {
  key: string
  id: string
  battleRecordId: string
  primaryGroup: GuildBattleListGroup
  groups: GuildBattleListGroup[]
  albionServer: AlbionServer
  battleIds: number[]
  battleRecordIds: string[]
  battleCount: number
  matchupCount: number
  clusterNames: string[]
  startedAt: string
  endedAt: string
  subjectName: string
  subjectAllianceName: string | null
  relationScope: BattleRelationScope
  subjectTeamSize: number
  subjectKills: number
  subjectDeaths: number
  subjectKillFame: number
  opponentTeamSize: number
  opponentKills: number
  opponentDeaths: number
  opponentKillFame: number
  opponentForceNames: string[]
  forceLines: GuildBattleSessionForceLine[]
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

function numberFromDb(value: number | string | null | undefined): number {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

export function toGuildBattleListRow(row: GuildBattleViewDbRow): GuildBattleListRow {
  return {
    id: row.id,
    battleRecordId: row.battle_record_id,
    legacyTenantBattleRecordId: row.legacy_tenant_battle_record_id,
    albionServer: row.albion_server,
    albionBattleId: row.albion_battle_id,
    clusterName: row.cluster_name,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    totalPlayers: numberFromDb(row.total_players),
    totalKills: numberFromDb(row.total_kills),
    totalFame: numberFromDb(row.total_fame),
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
    albionServer: primaryRow.albionServer,
    albionBattleId: primaryRow.albionBattleId,
    clusterName: primaryRow.clusterName,
    startedAt: primaryRow.startedAt,
    endedAt: sorted.reduce((latest, row) => latestIso(latest, row.endedAt), primaryRow.endedAt),
    totalPlayers: Math.max(...sorted.map((row) => row.totalPlayers)),
    totalKills: Math.max(...sorted.map((row) => row.totalKills)),
    totalFame: Math.max(...sorted.map((row) => row.totalFame)),
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

function parseIsoMs(value: string): number {
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : 0
}

function earliestIso(a: string, b: string): string {
  const ams = parseIsoMs(a)
  const bms = parseIsoMs(b)
  if (ams === 0) return b
  if (bms === 0) return a
  return bms < ams ? b : a
}

function latestIso(a: string, b: string): string {
  const ams = parseIsoMs(a)
  const bms = parseIsoMs(b)
  if (ams === 0) return b
  if (bms === 0) return a
  return bms > ams ? b : a
}

function compareGroupTimeAsc(
  a: GuildBattleListGroup,
  b: GuildBattleListGroup,
): number {
  const time = parseIsoMs(a.startedAt) - parseIsoMs(b.startedAt)
  if (time !== 0) return time
  return a.albionBattleId - b.albionBattleId
}

function compareSessionTimeDesc(
  a: GuildBattleSessionGroup,
  b: GuildBattleSessionGroup,
): number {
  const time = parseIsoMs(b.startedAt) - parseIsoMs(a.startedAt)
  if (time !== 0) return time
  return b.battleIds[0] - a.battleIds[0]
}

function comparePrimaryGroups(
  a: GuildBattleListGroup,
  b: GuildBattleListGroup,
): number {
  if (b.opponentTeamSize !== a.opponentTeamSize) {
    return b.opponentTeamSize - a.opponentTeamSize
  }
  if (b.opponentKillFame !== a.opponentKillFame) {
    return b.opponentKillFame - a.opponentKillFame
  }
  return a.id.localeCompare(b.id)
}

function subjectForceName(group: GuildBattleListGroup): string {
  const alliance = group.subjectAllianceName?.trim()
  if (alliance) return `${alliance} (${group.subjectName})`
  return group.subjectName
}

function forceLineSort(
  a: GuildBattleSessionForceLine,
  b: GuildBattleSessionForceLine,
): number {
  if (a.highlighted !== b.highlighted) return a.highlighted ? -1 : 1
  if (b.killFame !== a.killFame) return b.killFame - a.killFame
  if (b.kills !== a.kills) return b.kills - a.kills
  if (b.teamSize !== a.teamSize) return b.teamSize - a.teamSize
  return a.name.localeCompare(b.name)
}

function buildSessionForceLines(
  groups: ReadonlyArray<GuildBattleListGroup>,
): GuildBattleSessionForceLine[] {
  const forceLines = new Map<string, GuildBattleSessionForceLine>()

  for (const group of groups) {
    const subjectKey = `subject:${group.subjectAllianceName ?? group.subjectName}`
    const subject = forceLines.get(subjectKey) ?? {
      key: subjectKey,
      name: subjectForceName(group),
      forceKind: group.subjectAllianceName ? 'alliance' : 'guild',
      side: 'subject' as const,
      teamSize: 0,
      kills: 0,
      deaths: 0,
      killFame: 0,
      battleCount: 0,
      highlighted: true,
    }
    subject.teamSize = Math.max(subject.teamSize, group.subjectTeamSize)
    subject.kills += group.subjectKills
    subject.deaths += group.subjectDeaths
    subject.killFame += group.subjectKillFame
    subject.battleCount += 1
    forceLines.set(subjectKey, subject)

    for (const row of group.rows) {
      const opponentKey = `opponent:${row.opponentForceKind}:${row.opponentForceName}`
      const opponent = forceLines.get(opponentKey) ?? {
        key: opponentKey,
        name: row.opponentForceName,
        forceKind: row.opponentForceKind,
        side: 'opponent' as const,
        teamSize: 0,
        kills: 0,
        deaths: 0,
        killFame: 0,
        battleCount: 0,
        highlighted: false,
      }
      opponent.teamSize = Math.max(opponent.teamSize, row.opponentTeamSize)
      opponent.kills += row.opponentKills
      opponent.deaths += row.opponentDeaths
      opponent.killFame += row.opponentKillFame
      opponent.battleCount += 1
      forceLines.set(opponentKey, opponent)
    }
  }

  return Array.from(forceLines.values()).sort(forceLineSort)
}

function toGuildBattleSessionGroup(
  key: string,
  groups: ReadonlyArray<GuildBattleListGroup>,
): GuildBattleSessionGroup {
  const sorted = [...groups].sort(compareGroupTimeAsc)
  const primaryGroup = [...sorted].sort(comparePrimaryGroups)[0]
  const startedAt = sorted.reduce((earliest, group) => earliestIso(earliest, group.startedAt), sorted[0].startedAt)
  const endedAt = sorted.reduce((latest, group) => latestIso(latest, group.endedAt), sorted[0].endedAt)
  const subjectTeamSize = Math.max(...sorted.map((group) => group.subjectTeamSize))
  const subjectKills = sorted.reduce((sum, group) => sum + group.subjectKills, 0)
  const subjectDeaths = sorted.reduce((sum, group) => sum + group.subjectDeaths, 0)
  const subjectKillFame = sorted.reduce((sum, group) => sum + group.subjectKillFame, 0)
  const forceLines = buildSessionForceLines(sorted)
  const opponentLines = forceLines.filter((line) => line.side === 'opponent')
  const opponentTeamSize = opponentLines.reduce((sum, line) => sum + line.teamSize, 0)
  const opponentKills = opponentLines.reduce((sum, line) => sum + line.kills, 0)
  const opponentDeaths = opponentLines.reduce((sum, line) => sum + line.deaths, 0)
  const opponentKillFame = opponentLines.reduce((sum, line) => sum + line.killFame, 0)
  const sizeCategory =
    categorizeSize(Math.max(subjectTeamSize, opponentTeamSize)) ?? primaryGroup.sizeCategory

  return {
    key,
    id: primaryGroup.id,
    battleRecordId: primaryGroup.battleRecordId,
    primaryGroup,
    groups: sorted,
    albionServer: primaryGroup.albionServer,
    battleIds: Array.from(new Set(sorted.map((group) => group.albionBattleId))).sort(
      (a, b) => a - b,
    ),
    battleRecordIds: Array.from(new Set(sorted.map((group) => group.battleRecordId))),
    battleCount: sorted.length,
    matchupCount: sorted.reduce((sum, group) => sum + group.matchupCount, 0),
    clusterNames: uniqueValues(sorted.map((group) => group.clusterName).filter(Boolean) as string[]),
    startedAt,
    endedAt,
    subjectName: primaryGroup.subjectName,
    subjectAllianceName: primaryGroup.subjectAllianceName,
    relationScope: primaryGroup.relationScope,
    subjectTeamSize,
    subjectKills,
    subjectDeaths,
    subjectKillFame,
    opponentTeamSize,
    opponentKills,
    opponentDeaths,
    opponentKillFame,
    opponentForceNames: uniqueValues(opponentLines.map((line) => line.name)),
    forceLines,
    status: resolveGroupedStatus(sorted.map((group) => group.primaryRow)),
    evidenceSource: primaryGroup.evidenceSource,
    viewPolicy: sorted.some((group) => group.viewPolicy === 'default_meaningful')
      ? 'default_meaningful'
      : 'small_or_low_engagement',
    activityKind: sorted.some((group) => group.activityKind === 'zvz')
      ? 'zvz'
      : primaryGroup.activityKind,
    activitySource: sorted.some((group) => group.activitySource === 'manual')
      ? 'manual'
      : sorted.some((group) => group.activitySource === 'event_intent')
        ? 'event_intent'
        : 'automatic',
    activityReason: primaryGroup.activityReason,
    resultEstimate: estimateGroupedResult(subjectKillFame, opponentKillFame),
    sizeCategory,
    hasActiveDiff: sorted.some((group) => group.hasActiveDiff),
    hasLedgerOnlyRows: sorted.some((group) => group.hasLedgerOnlyRows),
  }
}

function sessionFamilyKey(group: GuildBattleListGroup): string {
  return `${group.albionServer}:${group.relationScope}:${group.activityKind}:${group.viewPolicy}`
}

export function groupGuildBattleSessions(
  groups: ReadonlyArray<GuildBattleListGroup>,
  limit = groups.length,
  gapMs = GUILD_BATTLE_SESSION_GAP_MS,
): GuildBattleSessionGroup[] {
  const byFamily = new Map<string, GuildBattleListGroup[]>()
  for (const group of groups) {
    const key = sessionFamilyKey(group)
    const current = byFamily.get(key)
    if (current) current.push(group)
    else byFamily.set(key, [group])
  }

  const sessions: GuildBattleSessionGroup[] = []
  for (const [familyKey, familyGroups] of byFamily.entries()) {
    const sorted = [...familyGroups].sort(compareGroupTimeAsc)
    let current: GuildBattleListGroup[] = []
    let latestEndedAtMs = 0
    let sessionIndex = 0

    for (const group of sorted) {
      const startedAtMs = parseIsoMs(group.startedAt)
      if (current.length === 0 || startedAtMs - latestEndedAtMs <= gapMs) {
        current.push(group)
        latestEndedAtMs = Math.max(latestEndedAtMs, parseIsoMs(group.endedAt))
        continue
      }

      sessions.push(toGuildBattleSessionGroup(`${familyKey}:${sessionIndex}`, current))
      sessionIndex += 1
      current = [group]
      latestEndedAtMs = parseIsoMs(group.endedAt)
    }

    if (current.length > 0) {
      sessions.push(toGuildBattleSessionGroup(`${familyKey}:${sessionIndex}`, current))
    }
  }

  return sessions.sort(compareSessionTimeDesc).slice(0, limit)
}
