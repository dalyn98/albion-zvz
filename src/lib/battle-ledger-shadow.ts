import { createHash } from 'node:crypto'
import {
  categorizeSize,
  type AlbionBattle,
  type AlbionBattleGuild,
  type Outcome,
  type SizeCategory,
} from './albion-battles'
import type { AlbionServer } from './albion-gameinfo'
import {
  battleActivityViewPolicy,
  classifyBattleActivity,
  type BattleActivityKind,
  type BattleActivitySource,
} from './battle-activity-classification'

export type RegistryEntityType = 'guild' | 'alliance' | 'player'
export type BattleParticipantType = RegistryEntityType
export type BattleRelationScope = 'direct' | 'alliance'
export type BattleProjectionStatus = 'provisional' | 'final' | 'low_confidence'
export type BattleProjectionEvidenceSource = 'battle_summary' | 'killboard_events'
export type BattleResultEstimate = 'advantage' | 'disadvantage' | 'even' | 'unclear'
export type BattleViewPolicy = 'default_meaningful' | 'small_or_low_engagement'

const MEANINGFUL_FORCE_MIN_SIZE = 10

interface BattleLedgerShadowInput {
  battleRecordId: string
  server: AlbionServer
  battle: AlbionBattle
  fetchedAt: string
}

export interface BattleLedgerRegistryEntityRow {
  albionServer: AlbionServer
  entityType: RegistryEntityType
  albionId: string
  currentName: string
  currentTag: string | null
  source: 'battle_snapshot'
  lastSeenAt: string
}

export interface BattleLedgerRegistryNameRow {
  albionServer: AlbionServer
  entityType: RegistryEntityType
  albionId: string
  name: string
  tag: string | null
  source: 'battle_snapshot'
  lastSeenAt: string
}

export interface BattleRecordSnapshotRow {
  battleRecordId: string
  rawHash: string
  fetchedAt: string
  summary: {
    albionBattleId: number
    startedAt: string
    endedAt: string
    totalPlayers: number
    totalKills: number
    totalFame: number
    clusterName: string | null
  }
}

export interface BattleParticipantSnapshotRow {
  battleRecordId: string
  participantType: BattleParticipantType
  entityAlbionId: string
  entityName: string
  guildAlbionId: string | null
  guildName: string | null
  allianceAlbionId: string | null
  allianceName: string | null
  teamSize: number
  kills: number
  deaths: number
  killFame: number
}

export interface BattleLedgerShadowRows {
  registryEntities: BattleLedgerRegistryEntityRow[]
  registryNames: BattleLedgerRegistryNameRow[]
  snapshot: BattleRecordSnapshotRow
  participants: BattleParticipantSnapshotRow[]
}

export interface GuildBattleViewProjectionRow {
  battleRecordId: string
  subjectType: 'guild'
  subjectAlbionId: string
  subjectName: string
  subjectAllianceId: string | null
  subjectAllianceName: string | null
  relationScope: BattleRelationScope
  opponentForceKey: string
  opponentForceKind: 'guild' | 'alliance'
  opponentForceAlbionId: string
  opponentForceName: string
  opponentAllianceId: string | null
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
  resultEstimate: BattleResultEstimate
  sizeCategory: SizeCategory | null
  legacyOutcome: Outcome | null
  evaluatedAt: string
}

interface GuildBattleViewProjectionInput {
  battleRecordId: string
  battle: AlbionBattle
  subjectGuildId: string
  subjectGuildName: string
  subjectAllianceId: string | null
  evaluatedAt: string
}

interface SideAccumulator {
  guildIds: Set<string>
  allianceIds: Set<string>
  teamSize: number
  kills: number
  deaths: number
  killFame: number
  guildNames: string[]
  allianceNames: string[]
}

interface ForceAccumulator {
  forceKey: string
  forceKind: 'guild' | 'alliance'
  forceAlbionId: string
  forceName: string
  allianceId: string | null
  guildIds: string[]
  teamSize: number
  kills: number
  deaths: number
  killFame: number
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

function playerCountByGuild(battle: AlbionBattle): Map<string, number> {
  const counts = new Map<string, number>()
  for (const player of Object.values(battle.players ?? {})) {
    counts.set(player.guildId, (counts.get(player.guildId) ?? 0) + 1)
  }
  return counts
}

function addUniqueEntity(
  rows: Map<string, BattleLedgerRegistryEntityRow>,
  row: BattleLedgerRegistryEntityRow,
): void {
  rows.set(`${row.albionServer}:${row.entityType}:${row.albionId}`, row)
}

function toEntityRow(input: {
  server: AlbionServer
  type: RegistryEntityType
  id: string
  name: string
  tag?: string | null
  seenAt: string
}): BattleLedgerRegistryEntityRow {
  return {
    albionServer: input.server,
    entityType: input.type,
    albionId: input.id,
    currentName: input.name,
    currentTag: input.tag ?? null,
    source: 'battle_snapshot',
    lastSeenAt: input.seenAt,
  }
}

function toNameRow(
  row: BattleLedgerRegistryEntityRow,
): BattleLedgerRegistryNameRow {
  return {
    albionServer: row.albionServer,
    entityType: row.entityType,
    albionId: row.albionId,
    name: row.currentName,
    tag: row.currentTag,
    source: row.source,
    lastSeenAt: row.lastSeenAt,
  }
}

export function buildBattleLedgerShadowRows(
  input: BattleLedgerShadowInput,
): BattleLedgerShadowRows {
  const registry = new Map<string, BattleLedgerRegistryEntityRow>()
  const participants: BattleParticipantSnapshotRow[] = []
  const teamSizeByGuild = playerCountByGuild(input.battle)

  for (const alliance of Object.values(input.battle.alliances ?? {})) {
    if (!alliance.id) continue
    addUniqueEntity(
      registry,
      toEntityRow({
        server: input.server,
        type: 'alliance',
        id: alliance.id,
        name: alliance.name,
        seenAt: input.fetchedAt,
      }),
    )
    participants.push({
      battleRecordId: input.battleRecordId,
      participantType: 'alliance',
      entityAlbionId: alliance.id,
      entityName: alliance.name,
      guildAlbionId: null,
      guildName: null,
      allianceAlbionId: alliance.id,
      allianceName: alliance.name,
      teamSize: Object.values(input.battle.players ?? {}).filter((p) => p.allianceId === alliance.id).length,
      kills: alliance.kills,
      deaths: alliance.deaths,
      killFame: alliance.killFame,
    })
  }

  for (const guild of Object.values(input.battle.guilds ?? {})) {
    addUniqueEntity(
      registry,
      toEntityRow({
        server: input.server,
        type: 'guild',
        id: guild.id,
        name: guild.name,
        seenAt: input.fetchedAt,
      }),
    )
    participants.push({
      battleRecordId: input.battleRecordId,
      participantType: 'guild',
      entityAlbionId: guild.id,
      entityName: guild.name,
      guildAlbionId: guild.id,
      guildName: guild.name,
      allianceAlbionId: guild.allianceId || null,
      allianceName: guild.alliance || null,
      teamSize: teamSizeByGuild.get(guild.id) ?? 0,
      kills: guild.kills,
      deaths: guild.deaths,
      killFame: guild.killFame,
    })
  }

  for (const player of Object.values(input.battle.players ?? {})) {
    addUniqueEntity(
      registry,
      toEntityRow({
        server: input.server,
        type: 'player',
        id: player.id,
        name: player.name,
        seenAt: input.fetchedAt,
      }),
    )
    participants.push({
      battleRecordId: input.battleRecordId,
      participantType: 'player',
      entityAlbionId: player.id,
      entityName: player.name,
      guildAlbionId: player.guildId || null,
      guildName: player.guildName || null,
      allianceAlbionId: player.allianceId || null,
      allianceName: player.allianceName || null,
      teamSize: 1,
      kills: player.kills,
      deaths: player.deaths,
      killFame: player.killFame,
    })
  }

  const registryEntities = [...registry.values()]
  return {
    registryEntities,
    registryNames: registryEntities.map(toNameRow),
    snapshot: {
      battleRecordId: input.battleRecordId,
      rawHash: sha256(input.battle),
      fetchedAt: input.fetchedAt,
      summary: {
        albionBattleId: input.battle.id,
        startedAt: input.battle.startTime,
        endedAt: input.battle.endTime,
        totalPlayers: Object.keys(input.battle.players ?? {}).length,
        totalKills: input.battle.totalKills,
        totalFame: input.battle.totalFame,
        clusterName: input.battle.clusterName,
      },
    },
    participants,
  }
}

function emptySide(): SideAccumulator {
  return {
    guildIds: new Set<string>(),
    allianceIds: new Set<string>(),
    teamSize: 0,
    kills: 0,
    deaths: 0,
    killFame: 0,
    guildNames: [],
    allianceNames: [],
  }
}

function addGuildToSide(
  side: SideAccumulator,
  battle: AlbionBattle,
  guild: AlbionBattleGuild,
  teamSize: number,
): void {
  side.guildIds.add(guild.id)
  if (guild.allianceId) side.allianceIds.add(guild.allianceId)
  side.teamSize += teamSize
  side.kills += guild.kills
  side.deaths += guild.deaths
  side.killFame += guild.killFame
  side.guildNames.push(guild.name)
  if (guild.allianceId) {
    const allianceName = battle.alliances?.[guild.allianceId]?.name ?? guild.alliance
    if (allianceName && !side.allianceNames.includes(allianceName)) {
      side.allianceNames.push(allianceName)
    }
  }
}

function buildSubjectSide(input: GuildBattleViewProjectionInput): {
  relationScope: BattleRelationScope
  subjectAllianceName: string | null
  side: SideAccumulator
} | null {
  const directGuild = input.battle.guilds?.[input.subjectGuildId]
  const teamSizeByGuild = playerCountByGuild(input.battle)

  const subjectAllianceId =
    directGuild?.allianceId || input.subjectAllianceId || null
  const subjectAllianceName =
    subjectAllianceId && input.battle.alliances?.[subjectAllianceId]?.name
      ? input.battle.alliances[subjectAllianceId].name
      : directGuild?.alliance || null

  const side = emptySide()
  if (directGuild) {
    if (directGuild.allianceId) {
      for (const guild of Object.values(input.battle.guilds ?? {})) {
        if (guild.allianceId !== directGuild.allianceId) continue
        addGuildToSide(side, input.battle, guild, teamSizeByGuild.get(guild.id) ?? 0)
      }
    } else {
      addGuildToSide(side, input.battle, directGuild, teamSizeByGuild.get(directGuild.id) ?? 0)
    }
    return { relationScope: 'direct', subjectAllianceName, side }
  }

  if (!input.subjectAllianceId) return null
  for (const guild of Object.values(input.battle.guilds ?? {})) {
    if (guild.allianceId !== input.subjectAllianceId) continue
    addGuildToSide(side, input.battle, guild, teamSizeByGuild.get(guild.id) ?? 0)
  }
  if (side.guildIds.size === 0) return null
  return { relationScope: 'alliance', subjectAllianceName, side }
}

function opposingForces(
  battle: AlbionBattle,
  subjectGuildIds: Set<string>,
): ForceAccumulator[] {
  const teamSizeByGuild = playerCountByGuild(battle)
  const forceMap = new Map<string, ForceAccumulator>()
  for (const guild of Object.values(battle.guilds ?? {})) {
    if (subjectGuildIds.has(guild.id)) continue
    const teamSize = teamSizeByGuild.get(guild.id) ?? 0
    const allianceId = guild.allianceId || null
    const forceKind: 'guild' | 'alliance' = allianceId ? 'alliance' : 'guild'
    const forceAlbionId = allianceId ?? guild.id
    const forceKey = `${forceKind === 'alliance' ? 'a' : 'g'}:${forceAlbionId}`
    const forceName = allianceId
      ? battle.alliances?.[allianceId]?.name ?? guild.alliance
      : guild.name
    const existing = forceMap.get(forceKey)
    if (existing) {
      existing.guildIds.push(guild.id)
      existing.teamSize += teamSize
      existing.kills += guild.kills
      existing.deaths += guild.deaths
      existing.killFame += guild.killFame
      continue
    }
    forceMap.set(forceKey, {
      forceKey,
      forceKind,
      forceAlbionId,
      forceName,
      allianceId,
      guildIds: [guild.id],
      teamSize,
      kills: guild.kills,
      deaths: guild.deaths,
      killFame: guild.killFame,
    })
  }

  return [...forceMap.values()].sort((a, b) => {
    if (b.teamSize !== a.teamSize) return b.teamSize - a.teamSize
    return b.killFame - a.killFame
  })
}

function resultEstimate(subjectKillFame: number, opponentKillFame: number): BattleResultEstimate {
  if (subjectKillFame === 0 && opponentKillFame === 0) return 'unclear'
  if (subjectKillFame > opponentKillFame) return 'advantage'
  if (subjectKillFame < opponentKillFame) return 'disadvantage'
  return 'even'
}

function legacyOutcomeFromEstimate(estimate: BattleResultEstimate): Outcome | null {
  if (estimate === 'advantage') return 'win'
  if (estimate === 'disadvantage') return 'loss'
  if (estimate === 'even') return 'tie'
  return null
}

function battleDurationSeconds(battle: AlbionBattle): number | null {
  const startedAt = Date.parse(battle.startTime)
  const endedAt = Date.parse(battle.endTime)
  if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) return null
  return Math.max(0, Math.round((endedAt - startedAt) / 1000))
}

export function buildGuildBattleViewProjections(
  input: GuildBattleViewProjectionInput,
): GuildBattleViewProjectionRow[] {
  const subject = buildSubjectSide(input)
  if (!subject) return []
  const forces = opposingForces(input.battle, subject.side.guildIds)
  if (forces.length === 0) return []
  const durationSeconds = battleDurationSeconds(input.battle)
  const smallOpponentForceCount = forces.filter(
    (force) => force.teamSize < MEANINGFUL_FORCE_MIN_SIZE,
  ).length

  return forces.map((force) => {
    const scaleSize = Math.max(subject.side.teamSize, force.teamSize)
    const sizeCategory = categorizeSize(scaleSize)
    const isMeaningful =
      sizeCategory !== null &&
      subject.side.teamSize >= MEANINGFUL_FORCE_MIN_SIZE &&
      force.teamSize >= MEANINGFUL_FORCE_MIN_SIZE
    const activity = classifyBattleActivity({
      subjectTeamSize: subject.side.teamSize,
      subjectKills: subject.side.kills,
      subjectDeaths: subject.side.deaths,
      opponentTeamSize: force.teamSize,
      opponentKills: force.kills,
      opponentDeaths: force.deaths,
      battleDurationSeconds: durationSeconds,
      opponentForceCount: forces.length,
      smallOpponentForceCount,
    })
    const estimate = resultEstimate(subject.side.killFame, force.killFame)
    return {
      battleRecordId: input.battleRecordId,
      subjectType: 'guild',
      subjectAlbionId: input.subjectGuildId,
      subjectName: input.subjectGuildName,
      subjectAllianceId: input.subjectAllianceId,
      subjectAllianceName: subject.subjectAllianceName,
      relationScope: subject.relationScope,
      opponentForceKey: force.forceKey,
      opponentForceKind: force.forceKind,
      opponentForceAlbionId: force.forceAlbionId,
      opponentForceName: force.forceName,
      opponentAllianceId: force.allianceId,
      subjectTeamSize: subject.side.teamSize,
      subjectKills: subject.side.kills,
      subjectDeaths: subject.side.deaths,
      subjectKillFame: subject.side.killFame,
      opponentTeamSize: force.teamSize,
      opponentKills: force.kills,
      opponentDeaths: force.deaths,
      opponentKillFame: force.killFame,
      status: 'provisional',
      evidenceSource: 'battle_summary',
      isMeaningful,
      viewPolicy: isMeaningful
        ? battleActivityViewPolicy(activity.kind)
        : 'small_or_low_engagement',
      activityKind: isMeaningful ? activity.kind : 'low_engagement',
      activitySource: activity.source,
      activityReason: isMeaningful ? activity.reason : 'low_engagement_or_force_floor',
      resultEstimate: estimate,
      sizeCategory,
      legacyOutcome: legacyOutcomeFromEstimate(estimate),
      evaluatedAt: input.evaluatedAt,
    }
  })
}
