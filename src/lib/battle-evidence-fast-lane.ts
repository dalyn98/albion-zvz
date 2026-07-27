import type { SupabaseClient } from '@supabase/supabase-js'
import type { AlbionBattle } from '@/lib/albion-battles'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import { ALBION_GAMEINFO_ENDPOINTS } from '@/lib/albion-endpoints'
import { fetchJsonWithRetry } from '@/lib/http-retry'

const FAST_LANE_EVENT_LIMIT = 50
const FAST_LANE_MAX_PARTICIPANT_REQUESTS = 16

interface AlbionEventPlayer {
  Id: string
  Name: string
  GuildId: string | null
  GuildName: string | null
  AllianceId?: string | null
  AllianceName?: string | null
  AverageItemPower?: number | null
  Equipment?: Record<string, unknown> | null
}

export interface AlbionBattleEvidenceEvent {
  EventId: number
  BattleId?: number
  TimeStamp: string
  TotalVictimKillFame?: number
  Killer: AlbionEventPlayer
  Victim: AlbionEventPlayer
}

export interface BattleEvidenceRow {
  guild_id: string
  event_id: number
  role: 'killer' | 'victim'
  discord_id: string | null
  albion_player_id: string
  player_name: string
  source_guild_id: string | null
  source_alliance_id: string | null
  opponent_name: string
  opponent_guild: string | null
  opponent_alliance: string | null
  opponent_guild_id: string | null
  opponent_alliance_id: string | null
  fame: number
  fame_is_observed: boolean
  item_power: number | null
  occurred_at: string
  equipment: Record<string, unknown> | null
  battle_id: number | null
}

export interface BattleEvidenceFastLaneResult {
  directEndpointSucceeded: boolean
  participantRequests: number
  eventsFound: number
  rowsUpserted: number
  warnings: string[]
  errors: string[]
}

export interface BattleEvidenceCoverageRow {
  event_id: number
  role: 'killer' | 'victim'
  albion_player_id: string
  source_guild_id: string | null
  opponent_guild: string | null
  opponent_guild_id: string | null
  fame_is_observed: boolean
}

export interface BattleEvidenceParticipantRequest {
  playerId: string
  kind: 'kills' | 'deaths'
}

function safeFame(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value ?? -1) >= 0 ? value! : 0
}

function safeItemPower(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : null
}

export function buildBattleEvidenceRows(input: {
  guildId: string
  homeGuildId: string
  battleId: number
  events: ReadonlyArray<AlbionBattleEvidenceEvent>
  discordIdByPlayerId?: ReadonlyMap<string, string>
}): BattleEvidenceRow[] {
  const rows = new Map<string, BattleEvidenceRow>()
  const discordIdByPlayerId = input.discordIdByPlayerId ?? new Map<string, string>()

  function add(
    event: AlbionBattleEvidenceEvent,
    role: 'killer' | 'victim',
    self: AlbionEventPlayer,
    opponent: AlbionEventPlayer,
  ) {
    if (event.BattleId !== undefined && event.BattleId !== input.battleId) return
    if (self.GuildId !== input.homeGuildId) return
    if (!Number.isSafeInteger(event.EventId) || !self.Id || !event.TimeStamp) return
    const fameIsObserved =
      Number.isSafeInteger(event.TotalVictimKillFame) &&
      (event.TotalVictimKillFame ?? -1) >= 0
    const row: BattleEvidenceRow = {
      guild_id: input.guildId,
      event_id: event.EventId,
      role,
      discord_id: discordIdByPlayerId.get(self.Id) ?? null,
      albion_player_id: self.Id,
      player_name: self.Name,
      source_guild_id: self.GuildId,
      source_alliance_id: self.AllianceId ?? null,
      opponent_name: opponent.Name,
      opponent_guild: opponent.GuildName,
      opponent_alliance: opponent.AllianceName ?? null,
      opponent_guild_id: opponent.GuildId,
      opponent_alliance_id: opponent.AllianceId ?? null,
      fame: safeFame(event.TotalVictimKillFame),
      fame_is_observed: fameIsObserved,
      item_power: safeItemPower(self.AverageItemPower),
      occurred_at: event.TimeStamp,
      equipment: self.Equipment ?? null,
      battle_id: event.BattleId ?? input.battleId,
    }
    rows.set(`${row.event_id}:${row.role}`, row)
  }

  for (const event of input.events) {
    add(event, 'killer', event.Killer, event.Victim)
    add(event, 'victim', event.Victim, event.Killer)
  }
  return [...rows.values()]
}

async function fetchBattleEvents(
  server: AlbionServer,
  battleId: number,
): Promise<AlbionBattleEvidenceEvent[]> {
  const url = `${ALBION_GAMEINFO_ENDPOINTS[server]}/events/battle/${battleId}`
  const data = await fetchJsonWithRetry<unknown>(url, {
    label: `events/battle/${battleId}`,
    userAgent: 'albion-zvz-battle-evidence/1.0',
    timeoutMs: 6_000,
    maxAttempts: 1,
    fetchInit: { cache: 'no-store' },
  })
  return Array.isArray(data) ? (data as AlbionBattleEvidenceEvent[]) : []
}

async function fetchPlayerEvents(input: {
  server: AlbionServer
  playerId: string
  kind: 'kills' | 'deaths'
}): Promise<AlbionBattleEvidenceEvent[]> {
  const url =
    `${ALBION_GAMEINFO_ENDPOINTS[input.server]}/players/` +
    `${encodeURIComponent(input.playerId)}/${input.kind}` +
    `?range=day&limit=${FAST_LANE_EVENT_LIMIT}&offset=0`
  const data = await fetchJsonWithRetry<unknown>(url, {
    label: `battle-evidence/${input.kind}`,
    userAgent: 'albion-zvz-battle-evidence/1.0',
    timeoutMs: 8_000,
    maxAttempts: 2,
    fetchInit: { cache: 'no-store' },
  })
  return Array.isArray(data) ? (data as AlbionBattleEvidenceEvent[]) : []
}

function relevantHomePlayers(
  battle: AlbionBattle,
  homeGuildId: string,
): Array<{ playerId: string; kills: number; deaths: number }> {
  return Object.values(battle.players ?? {})
    .filter((player) => player.guildId === homeGuildId)
    .map((player) => ({
      playerId: player.id,
      kills: Math.max(0, Math.floor(player.kills ?? 0)),
      deaths: Math.max(0, Math.floor(player.deaths ?? 0)),
    }))
    .filter((player) => player.kills > 0 || player.deaths > 0)
    .sort((a, b) => {
      const total = b.kills + b.deaths - (a.kills + a.deaths)
      return total !== 0 ? total : a.playerId.localeCompare(b.playerId)
    })
}

function hasUsableCoverageIdentity(
  row: BattleEvidenceCoverageRow,
  homeGuildId: string,
): boolean {
  const opponentName = row.opponent_guild?.trim() ?? ''
  return (
    row.fame_is_observed === true &&
    row.source_guild_id === homeGuildId &&
    (row.opponent_guild_id !== null || opponentName === '')
  )
}

export function buildMissingParticipantEvidenceRequests(input: {
  battle: AlbionBattle
  homeGuildId: string
  rows: ReadonlyArray<BattleEvidenceCoverageRow>
}): BattleEvidenceParticipantRequest[] {
  const coveredEventIds = new Map<string, Set<number>>()
  for (const row of input.rows) {
    if (!hasUsableCoverageIdentity(row, input.homeGuildId)) continue
    const key = `${row.albion_player_id}:${row.role}`
    const eventIds = coveredEventIds.get(key) ?? new Set<number>()
    eventIds.add(row.event_id)
    coveredEventIds.set(key, eventIds)
  }

  const requests: BattleEvidenceParticipantRequest[] = []
  for (const player of relevantHomePlayers(input.battle, input.homeGuildId)) {
    if (
      player.kills >
      (coveredEventIds.get(`${player.playerId}:killer`)?.size ?? 0)
    ) {
      requests.push({ playerId: player.playerId, kind: 'kills' })
    }
    if (
      player.deaths >
      (coveredEventIds.get(`${player.playerId}:victim`)?.size ?? 0)
    ) {
      requests.push({ playerId: player.playerId, kind: 'deaths' })
    }
  }
  return requests
}

export async function syncBattleEvidenceFastLane(input: {
  db: SupabaseClient
  server: AlbionServer
  guildId: string
  homeGuildId: string
  battle: AlbionBattle
}): Promise<BattleEvidenceFastLaneResult> {
  const result: BattleEvidenceFastLaneResult = {
    directEndpointSucceeded: false,
    participantRequests: 0,
    eventsFound: 0,
    rowsUpserted: 0,
    warnings: [],
    errors: [],
  }
  const homePlayers = relevantHomePlayers(input.battle, input.homeGuildId)
  const homeGuild = input.battle.guilds?.[input.homeGuildId]
  const expectedGuildEvents =
    Math.max(0, Math.floor(homeGuild?.kills ?? 0)) +
    Math.max(0, Math.floor(homeGuild?.deaths ?? 0))
  if (expectedGuildEvents === 0) {
    result.directEndpointSucceeded = true
    return result
  }

  const playerIds = homePlayers.map((player) => player.playerId)
  const discordIdByPlayerId = new Map<string, string>()
  if (playerIds.length > 0) {
    const { data, error } = await input.db
      .from('guild_avatars')
      .select('discord_id, albion_player_id')
      .eq('guild_id', input.guildId)
      .in('albion_player_id', playerIds)
    if (error) {
      result.warnings.push(`fast-lane avatar lookup: ${error.message}`)
    } else {
      for (const row of data ?? []) {
        if (row.albion_player_id && row.discord_id) {
          discordIdByPlayerId.set(row.albion_player_id as string, row.discord_id as string)
        }
      }
    }
  }

  let events: AlbionBattleEvidenceEvent[] = []
  try {
    const directEvents = await fetchBattleEvents(input.server, input.battle.id)
    result.directEndpointSucceeded = true
    events = directEvents
    if (directEvents.length === 0) {
      result.warnings.push(
        `events/battle/${input.battle.id} returned no evidence; participant fallback used`,
      )
    }
  } catch (error) {
    result.warnings.push(
      `events/battle/${input.battle.id} unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  const directRows = buildBattleEvidenceRows({
    guildId: input.guildId,
    homeGuildId: input.homeGuildId,
    battleId: input.battle.id,
    events,
    discordIdByPlayerId,
  })
  let requests = buildMissingParticipantEvidenceRequests({
    battle: input.battle,
    homeGuildId: input.homeGuildId,
    rows: directRows,
  })

  if (requests.length > 0) {
    const { data: existingRows, error: existingError } = await input.db
      .from('killboard_events')
      .select(
        'event_id, albion_player_id, role, source_guild_id, opponent_guild, opponent_guild_id, fame_is_observed',
      )
      .eq('guild_id', input.guildId)
      .eq('battle_id', input.battle.id)
    if (existingError) {
      result.warnings.push(`fast-lane existing evidence lookup: ${existingError.message}`)
    } else {
      requests = buildMissingParticipantEvidenceRequests({
        battle: input.battle,
        homeGuildId: input.homeGuildId,
        rows: [
          ...directRows,
          ...((existingRows ?? []) as BattleEvidenceCoverageRow[]),
        ],
      })
    }

    if (result.directEndpointSucceeded && requests.length > 0) {
      result.warnings.push(
        `events/battle/${input.battle.id} returned incomplete evidence; participant fallback used`,
      )
    }
    if (requests.length > FAST_LANE_MAX_PARTICIPANT_REQUESTS) {
      result.warnings.push(
        `battle-evidence participant fallback capped at ${FAST_LANE_MAX_PARTICIPANT_REQUESTS}; remaining players retry later`,
      )
    }

    for (const request of requests.slice(0, FAST_LANE_MAX_PARTICIPANT_REQUESTS)) {
      try {
        const playerEvents = await fetchPlayerEvents({
          server: input.server,
          playerId: request.playerId,
          kind: request.kind,
        })
        events.push(
          ...playerEvents.filter(
            (event) => event.BattleId === input.battle.id,
          ),
        )
      } catch (error) {
        result.errors.push(
          `fast-lane ${request.kind} ${request.playerId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
      result.participantRequests += 1
    }
  }

  const rows = buildBattleEvidenceRows({
    guildId: input.guildId,
    homeGuildId: input.homeGuildId,
    battleId: input.battle.id,
    events,
    discordIdByPlayerId,
  })
  result.eventsFound = new Set(rows.map((row) => row.event_id)).size
  if (rows.length === 0) return result

  const { error, count } = await input.db
    .from('killboard_events')
    .upsert(rows, {
      onConflict: 'guild_id,event_id,role',
      count: 'exact',
    })
  if (error) {
    result.errors.push(`fast-lane evidence upsert: ${error.message}`)
  } else {
    result.rowsUpserted = count ?? rows.length
  }
  return result
}
