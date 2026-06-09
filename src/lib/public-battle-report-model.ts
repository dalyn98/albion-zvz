import { isAlbionServer, type AlbionServer } from '@/lib/albion-gameinfo'

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
  total_fame: number | string | null
  cluster_name: string | null
}

export interface PublicBattleTenantRow {
  id: string
  battle_record_id: string
  home_guild_name: string | null
  home_team_size: number | null
  home_kills: number | null
  home_deaths: number | null
  home_kill_fame: number | string | null
  main_opponent_force_name: string | null
  main_opponent_team_size: number | null
  primary_opponent_name: string | null
  opponent_team_size: number | null
  started_at: string
  outcome: 'win' | 'loss' | 'tie' | null
  is_provisional: boolean | null
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
  totalFame: number
  homeGuildName: string
  homeTeamSize: number
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  opponentTeamSize: number
  opponentNames: string[]
  outcome: 'win' | 'loss' | 'tie' | null
  isProvisional: boolean
}

export interface PublicBattleGroupPlayerLine {
  playerName: string
  kills: number
  deaths: number
  killFame: number
  deathFame: number
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
  homeGuildName: string
  startedAt: string
  endedAt: string
  battleCount: number
  clusterNames: string[]
  opponentNames: string[]
  homeTeamSizeMax: number
  opponentTeamSizeTotal: number
  totalPlayers: number
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  totalFame: number
  hasProvisionalRows: boolean
  topKills: PublicBattleGroupPlayerLine[]
  topDeaths: PublicBattleGroupPlayerLine[]
  recentEvents: PublicBattleGroupEventLine[]
}

interface BuildPublicBattleGroupReportInput {
  server: AlbionServer
  requestedBattleIds: number[]
  battleRows: ReadonlyArray<PublicBattleRecordRow>
  tenantRows: ReadonlyArray<PublicBattleTenantRow>
  eventRows: ReadonlyArray<PublicBattleEventRow>
}

interface PlayerAccumulator {
  playerName: string
  kills: number
  deaths: number
  killFame: number
  deathFame: number
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

function uniqueStrings(values: ReadonlyArray<string | null | undefined>): string[] {
  const result: string[] = []
  const seen = new Set<string>()
  for (const value of values) {
    const trimmed = String(value ?? '').trim()
    if (!trimmed) continue
    const key = trimmed.toLocaleLowerCase('en-US')
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

function summarizeBattle(
  battleRow: PublicBattleRecordRow,
  tenantRows: ReadonlyArray<PublicBattleTenantRow>,
): PublicBattleGroupBattle | null {
  const albionBattleId = normalizeBattleId(battleRow.albion_battle_id)
  if (albionBattleId === null || tenantRows.length === 0) return null

  const mainRow = tenantRows.reduce((best, row) => {
    const bestSize = numberFromDb(best.main_opponent_team_size)
    const rowSize = numberFromDb(row.main_opponent_team_size)
    return rowSize > bestSize ? row : best
  }, tenantRows[0])
  const homeGuildName = String(mainRow.home_guild_name ?? '').trim() || 'Home guild'

  return {
    albionBattleId,
    startedAt: battleRow.started_at,
    endedAt: battleRow.ended_at,
    clusterName: battleRow.cluster_name?.trim() || null,
    totalPlayers: numberFromDb(battleRow.total_players),
    totalFame: numberFromDb(battleRow.total_fame),
    homeGuildName,
    homeTeamSize: Math.max(...tenantRows.map((row) => numberFromDb(row.home_team_size))),
    homeKills: tenantRows.reduce((sum, row) => sum + numberFromDb(row.home_kills), 0),
    homeDeaths: tenantRows.reduce((sum, row) => sum + numberFromDb(row.home_deaths), 0),
    homeKillFame: tenantRows.reduce((sum, row) => sum + numberFromDb(row.home_kill_fame), 0),
    opponentTeamSize: tenantRows.reduce(
      (sum, row) =>
        sum + (numberFromDb(row.main_opponent_team_size) || numberFromDb(row.opponent_team_size)),
      0,
    ),
    opponentNames: uniqueStrings(
      tenantRows.map((row) => row.main_opponent_force_name ?? row.primary_opponent_name),
    ),
    outcome: mainRow.outcome,
    isProvisional: tenantRows.some((row) => row.is_provisional === true),
  }
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

function buildPlayerLines(
  events: ReadonlyArray<PublicBattleGroupEventLine>,
): PublicBattleGroupPlayerLine[] {
  const players = new Map<string, PlayerAccumulator>()
  for (const event of events) {
    const key = playerSortName(event.playerName)
    const current = players.get(key) ?? {
      playerName: event.playerName,
      kills: 0,
      deaths: 0,
      killFame: 0,
      deathFame: 0,
    }
    players.set(
      key,
      event.role === 'killer'
        ? {
            ...current,
            kills: current.kills + 1,
            killFame: current.killFame + event.fame,
          }
        : {
            ...current,
            deaths: current.deaths + 1,
            deathFame: current.deathFame + event.fame,
          },
    )
  }
  return Array.from(players.values())
}

function topKillSort(a: PublicBattleGroupPlayerLine, b: PublicBattleGroupPlayerLine): number {
  if (b.kills !== a.kills) return b.kills - a.kills
  if (b.killFame !== a.killFame) return b.killFame - a.killFame
  if (a.deaths !== b.deaths) return a.deaths - b.deaths
  return playerSortName(a.playerName).localeCompare(playerSortName(b.playerName))
}

function topDeathSort(a: PublicBattleGroupPlayerLine, b: PublicBattleGroupPlayerLine): number {
  if (b.deaths !== a.deaths) return b.deaths - a.deaths
  if (b.deathFame !== a.deathFame) return b.deathFame - a.deathFame
  if (b.kills !== a.kills) return b.kills - a.kills
  return playerSortName(a.playerName).localeCompare(playerSortName(b.playerName))
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

  const tenantRowsByRecordId = new Map<string, PublicBattleTenantRow[]>()
  for (const row of input.tenantRows) {
    const rows = tenantRowsByRecordId.get(row.battle_record_id) ?? []
    tenantRowsByRecordId.set(row.battle_record_id, [...rows, row])
  }

  const unavailableBattleIds: number[] = []
  const battles = input.requestedBattleIds
    .map((battleId) => {
      const battleRow = rowsByBattleId.get(battleId)
      if (!battleRow) {
        unavailableBattleIds.push(battleId)
        return null
      }
      const tenantRows = tenantRowsByRecordId.get(battleRow.id) ?? []
      const battle = summarizeBattle(battleRow, tenantRows)
      if (!battle) unavailableBattleIds.push(battleId)
      return battle
    })
    .filter((battle): battle is PublicBattleGroupBattle => battle !== null)
    .sort((a, b) => compareIsoAsc(a.startedAt, b.startedAt) || a.albionBattleId - b.albionBattleId)

  if (battles.length === 0) return null

  const battleIds = new Set(battles.map((battle) => battle.albionBattleId))
  const events = buildEventLines(input.eventRows, battleIds)
  const playerLines = buildPlayerLines(events)

  return {
    server: input.server,
    requestedBattleIds: input.requestedBattleIds,
    unavailableBattleIds,
    battles,
    homeGuildName: battles[0].homeGuildName,
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
    opponentNames: uniqueStrings(battles.flatMap((battle) => battle.opponentNames)),
    homeTeamSizeMax: Math.max(...battles.map((battle) => battle.homeTeamSize)),
    opponentTeamSizeTotal: battles.reduce((sum, battle) => sum + battle.opponentTeamSize, 0),
    totalPlayers: battles.reduce((sum, battle) => sum + battle.totalPlayers, 0),
    homeKills: battles.reduce((sum, battle) => sum + battle.homeKills, 0),
    homeDeaths: battles.reduce((sum, battle) => sum + battle.homeDeaths, 0),
    homeKillFame: battles.reduce((sum, battle) => sum + battle.homeKillFame, 0),
    totalFame: battles.reduce((sum, battle) => sum + battle.totalFame, 0),
    hasProvisionalRows: battles.some((battle) => battle.isProvisional),
    topKills: playerLines.filter((line) => line.kills > 0).sort(topKillSort).slice(0, 10),
    topDeaths: playerLines.filter((line) => line.deaths > 0).sort(topDeathSort).slice(0, 10),
    recentEvents: events.slice(0, PUBLIC_BATTLE_GROUP_EVENT_LOG_LIMIT),
  }
}
