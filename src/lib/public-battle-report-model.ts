import { isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'
import { parseRawBattle, type AlbionBattlePlayer } from '@/lib/albion-battles'

export const PUBLIC_BATTLE_GROUP_MAX_IDS = 20
export const PUBLIC_BATTLE_GROUP_EVENT_LOG_LIMIT = 80

export type PublicBattleGroupParamError =
  | 'missing_server'
  | 'invalid_server'
  | 'missing_ids'
  | 'invalid_ids'
  | 'too_many_ids'

export interface PublicBattleGroupParams {
  server: AlbionServer
  ids: number[]
  canonicalIds: string
}

export interface PublicBattleRecordRow {
  id: string
  albion_battle_id: number | string | null
  started_at: string
  ended_at: string
  total_players: number | null
  total_kills: number | null
  total_fame: number | string | null
  cluster_name: string | null
  raw_battle: unknown
}

export interface PublicBattleEventRow {
  event_id: number | string | null
  battle_id: number | string | null
  role: string | null
  player_name: string | null
  fame: number | string | null
  occurred_at: string | null
}

export interface PublicBattleGroupBattle {
  albionBattleId: number
  startedAt: string
  endedAt: string
  clusterName: string | null
  totalPlayers: number
  totalKills: number
  totalFame: number
  topForceName: string | null
}

export interface PublicBattleGroupForceLine {
  forceKey: string
  forceKind: 'alliance' | 'guild'
  forceName: string
  players: number
  kills: number
  deaths: number
  killFame: number
  guildNames: string[]
  battleIds: number[]
  highlighted: boolean
}

export interface PublicBattleGroupPlayerLine {
  playerId: string
  playerName: string
  forceName: string
  guildName: string
  kills: number
  deaths: number
  killFame: number
}

export interface PublicBattleGroupEventLine {
  eventId: string
  battleId: number
  role: 'killer' | 'victim'
  playerName: string
  fame: number
  occurredAt: string | null
}

export interface PublicBattleGroupReport {
  server: AlbionServer
  requestedBattleIds: number[]
  unavailableBattleIds: number[]
  battles: PublicBattleGroupBattle[]
  forces: PublicBattleGroupForceLine[]
  primaryForce: PublicBattleGroupForceLine
  primaryForceName: string
  highlightedForceKey: string | null
  startedAt: string
  endedAt: string
  battleCount: number
  clusterNames: string[]
  totalPlayersUnique: number
  totalKills: number
  totalDeaths: number
  totalFame: number
  topKills: PublicBattleGroupPlayerLine[]
  topDeaths: PublicBattleGroupPlayerLine[]
  recentEvents: PublicBattleGroupEventLine[]
}

interface BuildPublicBattleGroupReportInput {
  server: AlbionServer
  requestedBattleIds: number[]
  battleRows: ReadonlyArray<PublicBattleRecordRow>
  eventRows: ReadonlyArray<PublicBattleEventRow>
  highlightGuildId?: string | null
  highlightGuildName?: string | null
}

interface ForceAccumulator {
  forceKey: string
  forceKind: 'alliance' | 'guild'
  forceName: string
  playerIds: Set<string>
  kills: number
  deaths: number
  killFame: number
  guildNames: Set<string>
  battleIds: Set<number>
  highlighted: boolean
}

interface PlayerAccumulator {
  playerId: string
  playerName: string
  forceName: string
  guildName: string
  kills: number
  deaths: number
  killFame: number
}

function firstParam(value: string | string[] | null | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

function numberFromDb(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.floor(n)
}

function normalizeBattleId(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (String(value).trim().length === 0) return null
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n <= 0) return null
  return n
}

function playerSortName(value: string): string {
  return value.toLocaleLowerCase('en-US')
}

function stableKey(value: string | null | undefined): string {
  return String(value ?? '').trim().toLocaleLowerCase('en-US')
}

function uniqueStrings(values: Iterable<string | null | undefined>): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const trimmed = String(value ?? '').trim()
    if (!trimmed) continue
    const key = stableKey(trimmed)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function compareIsoAsc(a: string, b: string): number {
  const ams = Date.parse(a)
  const bms = Date.parse(b)
  if (Number.isFinite(ams) && Number.isFinite(bms) && ams !== bms) return ams - bms
  return a.localeCompare(b)
}

function playerId(player: AlbionBattlePlayer, battleId: number): string {
  const id = String(player.id ?? '').trim()
  if (id) return id
  const name = String(player.name ?? '').trim()
  return `${battleId}:${name || 'unknown'}`
}

function playerGuildName(player: AlbionBattlePlayer): string {
  return String(player.guildName ?? '').trim() || 'Unknown guild'
}

function playerForce(player: AlbionBattlePlayer): {
  forceKey: string
  forceKind: 'alliance' | 'guild'
  forceName: string
} {
  const allianceId = String(player.allianceId ?? '').trim()
  const allianceName = String(player.allianceName ?? '').trim()
  if (allianceId) {
    return {
      forceKey: `a:${allianceId}`,
      forceKind: 'alliance',
      forceName: allianceName || playerGuildName(player),
    }
  }

  const guildId = String(player.guildId ?? '').trim()
  const guildName = playerGuildName(player)
  return {
    forceKey: guildId ? `g:${guildId}` : `u:${stableKey(guildName) || 'unknown'}`,
    forceKind: 'guild',
    forceName: guildName,
  }
}

function playerMatchesHighlight(
  player: AlbionBattlePlayer,
  highlightGuildId: string | null | undefined,
  highlightGuildName: string | null | undefined,
): boolean {
  const id = String(highlightGuildId ?? '').trim()
  if (id && String(player.guildId ?? '').trim() === id) return true
  const name = stableKey(highlightGuildName)
  return !!name && stableKey(player.guildName) === name
}

function forceSort(a: PublicBattleGroupForceLine, b: PublicBattleGroupForceLine): number {
  if (b.kills !== a.kills) return b.kills - a.kills
  if (b.killFame !== a.killFame) return b.killFame - a.killFame
  if (b.players !== a.players) return b.players - a.players
  if (a.deaths !== b.deaths) return a.deaths - b.deaths
  return playerSortName(a.forceName).localeCompare(playerSortName(b.forceName))
}

function topKillSort(a: PublicBattleGroupPlayerLine, b: PublicBattleGroupPlayerLine): number {
  if (b.kills !== a.kills) return b.kills - a.kills
  if (b.killFame !== a.killFame) return b.killFame - a.killFame
  if (a.deaths !== b.deaths) return a.deaths - b.deaths
  return playerSortName(a.playerName).localeCompare(playerSortName(b.playerName))
}

function topDeathSort(a: PublicBattleGroupPlayerLine, b: PublicBattleGroupPlayerLine): number {
  if (b.deaths !== a.deaths) return b.deaths - a.deaths
  if (b.killFame !== a.killFame) return b.killFame - a.killFame
  if (b.kills !== a.kills) return b.kills - a.kills
  return playerSortName(a.playerName).localeCompare(playerSortName(b.playerName))
}

function buildEventLines(
  eventRows: ReadonlyArray<PublicBattleEventRow>,
  battleIds: ReadonlySet<number>,
): PublicBattleGroupEventLine[] {
  return eventRows
    .map<PublicBattleGroupEventLine | null>((row) => {
      if (row.role !== 'killer' && row.role !== 'victim') return null
      const battleId = normalizeBattleId(row.battle_id)
      if (battleId === null || !battleIds.has(battleId)) return null
      const eventId = String(row.event_id ?? '').trim()
      const playerName = String(row.player_name ?? '').trim()
      if (!eventId || !playerName) return null
      return {
        eventId,
        battleId,
        role: row.role,
        playerName,
        fame: numberFromDb(row.fame),
        occurredAt: row.occurred_at,
      }
    })
    .filter((line): line is PublicBattleGroupEventLine => line !== null)
    .sort((a, b) => {
      if (!a.occurredAt && !b.occurredAt) return Number(a.eventId) - Number(b.eventId)
      if (!a.occurredAt) return 1
      if (!b.occurredAt) return -1
      const dateCompare = compareIsoAsc(a.occurredAt, b.occurredAt)
      if (dateCompare !== 0) return dateCompare
      return Number(a.eventId) - Number(b.eventId)
    })
}

function forceLinesFromAccumulators(
  accumulators: Iterable<ForceAccumulator>,
): PublicBattleGroupForceLine[] {
  return Array.from(accumulators)
    .map((force) => ({
      forceKey: force.forceKey,
      forceKind: force.forceKind,
      forceName: force.forceName,
      players: force.playerIds.size,
      kills: force.kills,
      deaths: force.deaths,
      killFame: force.killFame,
      guildNames: uniqueStrings(force.guildNames),
      battleIds: Array.from(force.battleIds).sort((a, b) => a - b),
      highlighted: force.highlighted,
    }))
    .sort(forceSort)
}

export function normalizePublicBattleGroupParams(input: {
  server?: string | string[] | null
  ids?: string | string[] | null
}): { ok: true; params: PublicBattleGroupParams } | { ok: false; error: PublicBattleGroupParamError } {
  const serverValue = firstParam(input.server)?.trim().toLowerCase()
  if (!serverValue) return { ok: false, error: 'missing_server' }
  if (!isAlbionServer(serverValue)) return { ok: false, error: 'invalid_server' }

  const idsValue = firstParam(input.ids)?.trim()
  if (!idsValue) return { ok: false, error: 'missing_ids' }
  const ids = Array.from(
    new Set(
      idsValue
        .split(',')
        .map((part) => normalizeBattleId(part.trim()))
        .filter((id): id is number => id !== null),
    ),
  ).sort((a, b) => a - b)

  if (ids.length === 0) return { ok: false, error: 'invalid_ids' }
  if (ids.length > PUBLIC_BATTLE_GROUP_MAX_IDS) return { ok: false, error: 'too_many_ids' }
  return {
    ok: true,
    params: {
      server: serverValue,
      ids,
      canonicalIds: ids.join(','),
    },
  }
}

export function buildPublicBattleGroupReport(
  input: BuildPublicBattleGroupReportInput,
): PublicBattleGroupReport | null {
  const rowsByBattleId = new Map<number, PublicBattleRecordRow>()
  for (const row of input.battleRows) {
    const battleId = normalizeBattleId(row.albion_battle_id)
    if (battleId !== null) rowsByBattleId.set(battleId, row)
  }

  const unavailableBattleIds: number[] = []
  const forces = new Map<string, ForceAccumulator>()
  const players = new Map<string, PlayerAccumulator>()
  const uniquePlayerIds = new Set<string>()
  const battles: PublicBattleGroupBattle[] = []

  for (const requestedBattleId of input.requestedBattleIds) {
    const row = rowsByBattleId.get(requestedBattleId)
    const battle = row ? parseRawBattle(row.raw_battle) : null
    if (!row || !battle) {
      unavailableBattleIds.push(requestedBattleId)
      continue
    }

    const localForces = new Map<string, ForceAccumulator>()
    for (const player of Object.values(battle.players ?? {})) {
      const id = playerId(player, requestedBattleId)
      uniquePlayerIds.add(id)
      const force = playerForce(player)
      const guildName = playerGuildName(player)
      const kills = numberFromDb(player.kills)
      const deaths = numberFromDb(player.deaths)
      const killFame = numberFromDb(player.killFame)
      const highlighted = playerMatchesHighlight(
        player,
        input.highlightGuildId,
        input.highlightGuildName,
      )

      for (const map of [forces, localForces]) {
        const current = map.get(force.forceKey) ?? {
          forceKey: force.forceKey,
          forceKind: force.forceKind,
          forceName: force.forceName,
          playerIds: new Set<string>(),
          kills: 0,
          deaths: 0,
          killFame: 0,
          guildNames: new Set<string>(),
          battleIds: new Set<number>(),
          highlighted: false,
        }
        current.playerIds.add(id)
        current.kills += kills
        current.deaths += deaths
        current.killFame += killFame
        current.guildNames.add(guildName)
        current.battleIds.add(requestedBattleId)
        current.highlighted = current.highlighted || highlighted
        map.set(force.forceKey, current)
      }

      const playerCurrent = players.get(id) ?? {
        playerId: id,
        playerName: String(player.name ?? '').trim() || 'Unknown player',
        forceName: force.forceName,
        guildName,
        kills: 0,
        deaths: 0,
        killFame: 0,
      }
      players.set(id, {
        ...playerCurrent,
        forceName: force.forceName,
        guildName,
        kills: playerCurrent.kills + kills,
        deaths: playerCurrent.deaths + deaths,
        killFame: playerCurrent.killFame + killFame,
      })
    }

    const localForceRows = forceLinesFromAccumulators(localForces.values())
    battles.push({
      albionBattleId: requestedBattleId,
      startedAt: battle.startTime || row.started_at,
      endedAt: battle.endTime || row.ended_at,
      clusterName: battle.clusterName?.trim() || row.cluster_name?.trim() || null,
      totalPlayers: Object.keys(battle.players ?? {}).length || numberFromDb(row.total_players),
      totalKills: numberFromDb(battle.totalKills || row.total_kills),
      totalFame: numberFromDb(battle.totalFame || row.total_fame),
      topForceName: localForceRows[0]?.forceName ?? null,
    })
  }

  const forceRows = forceLinesFromAccumulators(forces.values())
  if (battles.length === 0 || forceRows.length === 0) return null

  battles.sort(
    (a, b) => compareIsoAsc(a.startedAt, b.startedAt) || a.albionBattleId - b.albionBattleId,
  )
  const battleIds = new Set(battles.map((battle) => battle.albionBattleId))
  const events = buildEventLines(input.eventRows, battleIds)
  const playerRows = Array.from(players.values())
  const highlightedForce = forceRows.find((force) => force.highlighted) ?? null
  const primaryForce = highlightedForce ?? forceRows[0]

  return {
    server: input.server,
    requestedBattleIds: input.requestedBattleIds,
    unavailableBattleIds,
    battles,
    forces: forceRows,
    primaryForce,
    primaryForceName: primaryForce.forceName,
    highlightedForceKey: highlightedForce?.forceKey ?? null,
    startedAt: battles[0].startedAt,
    endedAt: battles.reduce((latest, battle) => {
      const latestMs = Date.parse(latest)
      const battleMs = Date.parse(battle.endedAt)
      if (!Number.isFinite(latestMs)) return battle.endedAt
      if (!Number.isFinite(battleMs)) return latest
      return battleMs > latestMs ? battle.endedAt : latest
    }, battles[0].endedAt),
    battleCount: battles.length,
    clusterNames: uniqueStrings(battles.map((battle) => battle.clusterName)),
    totalPlayersUnique: uniquePlayerIds.size,
    totalKills: forceRows.reduce((sum, force) => sum + force.kills, 0),
    totalDeaths: forceRows.reduce((sum, force) => sum + force.deaths, 0),
    totalFame: forceRows.reduce((sum, force) => sum + force.killFame, 0),
    topKills: playerRows.filter((line) => line.kills > 0).sort(topKillSort).slice(0, 10),
    topDeaths: playerRows.filter((line) => line.deaths > 0).sort(topDeathSort).slice(0, 10),
    recentEvents: events.slice(0, PUBLIC_BATTLE_GROUP_EVENT_LOG_LIMIT),
  }
}
