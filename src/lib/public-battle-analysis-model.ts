import type {
  PublicBattleGroupPlayerLine,
  PublicBattleGroupReport,
} from '@/lib/public-battle-report-model'

export const PUBLIC_BATTLE_EVENT_PAGE_SIZE = 50
export const PUBLIC_BATTLE_EVENT_MAX_PAGES_PER_BATTLE = 20
export const PUBLIC_BATTLE_EVENT_MAX_GROUP_PAGES = 30

export const PUBLIC_BATTLE_EQUIPMENT_SLOTS = [
  'MainHand',
  'OffHand',
  'Head',
  'Armor',
  'Shoes',
  'Cape',
  'Bag',
  'Mount',
  'Potion',
  'Food',
] as const

export type PublicBattleEquipmentSlot = (typeof PUBLIC_BATTLE_EQUIPMENT_SLOTS)[number]

export interface PublicBattleAnalysisItem {
  type: string
  count: number
  quality: number | null
}

export type PublicBattleAnalysisEquipment = Partial<
  Record<PublicBattleEquipmentSlot, PublicBattleAnalysisItem | null>
>

export interface PublicBattleAnalysisActor {
  playerId: string
  playerName: string
  guildId: string
  guildName: string
  allianceId: string | null
  allianceName: string | null
  forceKey: string
  forceName: string
  allianceKey: string
  guildKey: string
  itemPower: number | null
  weaponId: string | null
  equipment: PublicBattleAnalysisEquipment | null
}

export interface PublicBattleAnalysisEvent {
  eventId: string
  battleId: number
  occurredAt: string
  fame: number
  killer: PublicBattleAnalysisActor
  victim: PublicBattleAnalysisActor
}

export interface PublicBattleAnalysisPlayerObservation {
  battleId: number
  occurredAt: string
  itemPower: number | null
  weaponId: string | null
  equipment: PublicBattleAnalysisEquipment | null
}

export interface PublicBattleAnalysisPlayerEventStats {
  battleId: number
  damage: number
  healing: number
}

export interface PublicBattleAnalysisPlayer extends PublicBattleGroupPlayerLine {
  allianceKey: string
  guildKey: string
  damage: number
  healing: number
  eventStats: PublicBattleAnalysisPlayerEventStats[]
  observations: PublicBattleAnalysisPlayerObservation[]
}

export type PublicBattleAnalysisCoverageStatus = 'complete' | 'partial' | 'unavailable'

export interface PublicBattleAnalysisBattleCoverage {
  battleId: number
  expected: number
  observed: number
  status: PublicBattleAnalysisCoverageStatus
  failedPages: number
  truncated: boolean
}

export interface PublicBattleAnalysisCoverage {
  status: PublicBattleAnalysisCoverageStatus
  expected: number
  observed: number
  battles: PublicBattleAnalysisBattleCoverage[]
}

export interface PublicBattleGroupAnalysis {
  coverage: PublicBattleAnalysisCoverage
  events: PublicBattleAnalysisEvent[]
  players: PublicBattleAnalysisPlayer[]
}

export interface PublicBattleRawEventBatch {
  battleId: number
  events: unknown[]
  failedPageOffsets?: number[]
  truncated?: boolean
}

export interface PublicBattleAnalysisContribution {
  actor: PublicBattleAnalysisActor
  damage: number
  healing: number
}

export interface PublicBattleProjectionEvent extends PublicBattleAnalysisEvent {
  participants: PublicBattleAnalysisContribution[]
  observations: PublicBattleAnalysisActor[]
}

interface MutablePlayer extends PublicBattleAnalysisPlayer {
  eventStatsByBattle: Map<number, PublicBattleAnalysisPlayerEventStats>
  observationsByBattle: Map<number, PublicBattleAnalysisPlayerObservation>
}

const PUBLIC_BATTLE_MAX_ACTORS_PER_EVENT = 400

function record(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function text(value: unknown, maxLength = 200): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function finiteNumber(value: unknown): number | null {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function nonNegativeNumber(value: unknown): number {
  const number = finiteNumber(value)
  return number !== null && number > 0 ? number : 0
}

function nonNegativeInteger(value: unknown): number {
  return Math.floor(nonNegativeNumber(value))
}

function stableKey(value: string): string {
  return value.trim().toLocaleLowerCase('en-US')
}

function normalizeBattleId(value: unknown): number | null {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function normalizeTimestamp(value: unknown): string | null {
  const timestamp = text(value)
  return timestamp && Number.isFinite(Date.parse(timestamp)) ? timestamp : null
}

function normalizeEquipment(value: unknown): PublicBattleAnalysisEquipment | null {
  const raw = record(value)
  if (!raw) return null
  const equipment: PublicBattleAnalysisEquipment = {}
  let found = false
  for (const slot of PUBLIC_BATTLE_EQUIPMENT_SLOTS) {
    const rawItem = record(raw[slot])
    if (!rawItem) {
      equipment[slot] = null
      continue
    }
    const type = text(rawItem.Type)
    if (!type) {
      equipment[slot] = null
      continue
    }
    found = true
    equipment[slot] = {
      type,
      count: Math.max(1, nonNegativeInteger(rawItem.Count)),
      quality: finiteNumber(rawItem.Quality),
    }
  }
  return found ? equipment : null
}

function guildKey(guildId: string, guildName: string, playerName: string): string {
  if (guildId) return `g:${guildId}`
  return `u:${stableKey(guildName || playerName || 'unknown')}`
}

function normalizeActor(value: unknown): PublicBattleAnalysisActor | null {
  const raw = record(value)
  if (!raw) return null
  const playerId = text(raw.Id)
  const playerName = text(raw.Name)
  if (!playerId && !playerName) return null
  const guildId = text(raw.GuildId)
  const guildName = text(raw.GuildName) || 'Unknown guild'
  const allianceId = text(raw.AllianceId) || null
  const allianceName = text(raw.AllianceName) || null
  const resolvedGuildKey = guildKey(guildId, guildName, playerName)
  const allianceKey = allianceId ? `a:${allianceId}` : resolvedGuildKey
  const equipment = normalizeEquipment(raw.Equipment)
  const itemPower = finiteNumber(raw.AverageItemPower)
  return {
    playerId: playerId || `name:${stableKey(playerName)}`,
    playerName: playerName || 'Unknown player',
    guildId,
    guildName,
    allianceId,
    allianceName,
    forceKey: allianceKey,
    forceName: allianceName || guildName,
    allianceKey,
    guildKey: resolvedGuildKey,
    itemPower: itemPower !== null && itemPower > 0 ? itemPower : null,
    weaponId: equipment?.MainHand?.type ?? null,
    equipment,
  }
}

function normalizeActorList(value: unknown): PublicBattleAnalysisActor[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, PUBLIC_BATTLE_MAX_ACTORS_PER_EVENT)
    .map(normalizeActor)
    .filter((actor): actor is PublicBattleAnalysisActor => actor !== null)
}

function normalizeContributions(value: unknown): PublicBattleAnalysisContribution[] {
  if (!Array.isArray(value)) return []
  const contributions = new Map<string, PublicBattleAnalysisContribution>()
  for (const entry of value.slice(0, PUBLIC_BATTLE_MAX_ACTORS_PER_EVENT)) {
    const actor = normalizeActor(entry)
    const raw = record(entry)
    if (!actor || !raw) continue
    const current = contributions.get(actor.playerId)
    const damage = nonNegativeNumber(raw.DamageDone)
    const healing = nonNegativeNumber(raw.SupportHealingDone)
    contributions.set(actor.playerId, {
      actor,
      damage: (current?.damage ?? 0) + damage,
      healing: (current?.healing ?? 0) + healing,
    })
  }
  return Array.from(contributions.values())
}

function normalizeEvent(value: unknown, expectedBattleId: number): PublicBattleProjectionEvent | null {
  const raw = record(value)
  if (!raw) return null
  const battleId = normalizeBattleId(raw.BattleId)
  const normalizedEventId = normalizeBattleId(raw.EventId)
  const eventId = normalizedEventId === null ? '' : String(normalizedEventId)
  const occurredAt = normalizeTimestamp(raw.TimeStamp)
  const killer = normalizeActor(raw.Killer)
  const victim = normalizeActor(raw.Victim)
  if (!battleId || battleId !== expectedBattleId || !eventId || !occurredAt || !killer || !victim) {
    return null
  }
  const participants = normalizeContributions(raw.Participants)
  return {
    eventId,
    battleId,
    occurredAt,
    fame: nonNegativeInteger(raw.TotalVictimKillFame),
    killer,
    victim,
    participants,
    observations: [
      killer,
      victim,
      ...participants.map((participant) => participant.actor),
      ...normalizeActorList(raw.GroupMembers),
    ],
  }
}

export function normalizePublicBattleProjectionEvents(
  expectedBattleId: number,
  values: ReadonlyArray<unknown>,
): PublicBattleProjectionEvent[] {
  const events: PublicBattleProjectionEvent[] = []
  const seen = new Set<string>()

  for (const value of values) {
    const event = normalizeEvent(value, expectedBattleId)
    if (!event) continue
    const key = `${event.battleId}:${event.eventId}`
    if (seen.has(key)) continue
    seen.add(key)
    events.push(event)
  }

  return events.sort((a, b) => {
    const time = Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
    if (time !== 0) return time
    return Number(a.eventId) - Number(b.eventId)
  })
}

function equipmentScore(equipment: PublicBattleAnalysisEquipment | null): number {
  if (!equipment) return 0
  return PUBLIC_BATTLE_EQUIPMENT_SLOTS.reduce(
    (score, slot) => score + (equipment[slot]?.type ? 1 : 0),
    0,
  )
}

function shouldReplaceObservation(
  current: PublicBattleAnalysisPlayerObservation | undefined,
  candidate: PublicBattleAnalysisPlayerObservation,
): boolean {
  if (!current) return true
  const scoreDiff = equipmentScore(candidate.equipment) - equipmentScore(current.equipment)
  if (scoreDiff !== 0) return scoreDiff > 0
  if (candidate.itemPower !== null && current.itemPower === null) return true
  return Date.parse(candidate.occurredAt) > Date.parse(current.occurredAt)
}

function basePlayerToMutable(player: PublicBattleGroupPlayerLine): MutablePlayer {
  const currentBattle = player.battleStats.at(-1)
  const allianceKey = currentBattle?.allianceKey ?? (player.allianceId ? `a:${player.allianceId}` : currentBattle?.guildKey ?? player.forceKey)
  const resolvedGuildKey = currentBattle?.guildKey ?? guildKey(player.guildId, player.guildName, player.playerName)
  return {
    ...player,
    allianceKey,
    guildKey: resolvedGuildKey,
    damage: 0,
    healing: 0,
    eventStats: [],
    observations: [],
    eventStatsByBattle: new Map(),
    observationsByBattle: new Map(),
  }
}

function actorToMutable(actor: PublicBattleAnalysisActor): MutablePlayer {
  return {
    playerId: actor.playerId,
    playerName: actor.playerName,
    forceKey: actor.forceKey,
    forceName: actor.forceName,
    guildId: actor.guildId,
    guildName: actor.guildName,
    allianceId: actor.allianceId,
    allianceName: actor.allianceName,
    allianceKey: actor.allianceKey,
    guildKey: actor.guildKey,
    kills: 0,
    deaths: 0,
    killFame: 0,
    battleIds: [],
    battleStats: [],
    damage: 0,
    healing: 0,
    eventStats: [],
    observations: [],
    eventStatsByBattle: new Map(),
    observationsByBattle: new Map(),
  }
}

function playerLookupKeys(actor: PublicBattleAnalysisActor): string[] {
  return [actor.playerId, `name:${stableKey(actor.playerName)}`]
}

function coverageStatus(input: {
  expected: number
  observed: number
  failedPages: number
  truncated: boolean
}): PublicBattleAnalysisCoverageStatus {
  if (input.expected === 0 && input.failedPages === 0 && !input.truncated) return 'complete'
  if (input.observed === 0 && input.expected > 0) return 'unavailable'
  if (input.failedPages > 0 || input.truncated || input.observed < input.expected) return 'partial'
  return 'complete'
}

export function buildPublicBattleGroupAnalysis(input: {
  report: PublicBattleGroupReport
  batches: ReadonlyArray<PublicBattleRawEventBatch>
}): PublicBattleGroupAnalysis {
  const batchByBattleId = new Map(input.batches.map((batch) => [batch.battleId, batch]))
  const normalizedEvents: PublicBattleProjectionEvent[] = []
  const seenEvents = new Set<string>()
  const battleCoverage: PublicBattleAnalysisBattleCoverage[] = []

  for (const battle of input.report.battles) {
    const batch = batchByBattleId.get(battle.albionBattleId)
    let observed = 0
    for (const event of normalizePublicBattleProjectionEvents(
      battle.albionBattleId,
      batch?.events ?? [],
    )) {
      const eventKey = `${event.battleId}:${event.eventId}`
      if (!seenEvents.has(eventKey)) {
        seenEvents.add(eventKey)
        normalizedEvents.push(event)
        observed += 1
      }
    }
    const failedPages = batch?.failedPageOffsets?.length ?? 0
    const truncated = batch?.truncated ?? false
    battleCoverage.push({
      battleId: battle.albionBattleId,
      expected: battle.totalKills,
      observed,
      status: coverageStatus({
        expected: battle.totalKills,
        observed,
        failedPages,
        truncated,
      }),
      failedPages,
      truncated,
    })
  }

  normalizedEvents.sort((a, b) => {
    const time = Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
    if (time !== 0) return time
    return Number(a.eventId) - Number(b.eventId)
  })

  const players = new Map<string, MutablePlayer>()
  const names = new Map<string, string>()
  for (const player of input.report.players) {
    const mutable = basePlayerToMutable(player)
    players.set(player.playerId, mutable)
    names.set(`name:${stableKey(player.playerName)}`, player.playerId)
  }

  const resolvePlayer = (actor: PublicBattleAnalysisActor): MutablePlayer => {
    for (const key of playerLookupKeys(actor)) {
      const resolvedId = players.has(key) ? key : names.get(key)
      if (resolvedId) return players.get(resolvedId)!
    }
    const mutable = actorToMutable(actor)
    players.set(actor.playerId, mutable)
    names.set(`name:${stableKey(actor.playerName)}`, actor.playerId)
    return mutable
  }

  for (const event of normalizedEvents) {
    for (const actor of event.observations) {
      const player = resolvePlayer(actor)
      if (!player.battleIds.includes(event.battleId)) {
        player.battleIds.push(event.battleId)
      }
      const candidate: PublicBattleAnalysisPlayerObservation = {
        battleId: event.battleId,
        occurredAt: event.occurredAt,
        itemPower: actor.itemPower,
        weaponId: actor.weaponId,
        equipment: actor.equipment,
      }
      if (shouldReplaceObservation(player.observationsByBattle.get(event.battleId), candidate)) {
        player.observationsByBattle.set(event.battleId, candidate)
      }
    }

    for (const contribution of event.participants) {
      const player = resolvePlayer(contribution.actor)
      const current = player.eventStatsByBattle.get(event.battleId) ?? {
        battleId: event.battleId,
        damage: 0,
        healing: 0,
      }
      current.damage += contribution.damage
      current.healing += contribution.healing
      player.eventStatsByBattle.set(event.battleId, current)
      player.damage += contribution.damage
      player.healing += contribution.healing
    }
  }

  const outputPlayers = Array.from(players.values())
    .map<PublicBattleAnalysisPlayer>((player) => {
      const { eventStatsByBattle, observationsByBattle, ...output } = player
      return {
        ...output,
        battleIds: [...output.battleIds].sort((a, b) => a - b),
        eventStats: Array.from(eventStatsByBattle.values()).sort((a, b) => a.battleId - b.battleId),
        observations: Array.from(observationsByBattle.values()).sort((a, b) => a.battleId - b.battleId),
      }
    })
    .sort((a, b) => {
      if (b.kills !== a.kills) return b.kills - a.kills
      if (b.killFame !== a.killFame) return b.killFame - a.killFame
      return a.playerName.localeCompare(b.playerName)
    })

  const expected = battleCoverage.reduce((sum, battle) => sum + battle.expected, 0)
  const observed = battleCoverage.reduce((sum, battle) => sum + battle.observed, 0)
  const statuses = new Set(battleCoverage.map((battle) => battle.status))
  const status: PublicBattleAnalysisCoverageStatus = statuses.has('partial')
    ? 'partial'
    : statuses.has('unavailable')
      ? observed > 0
        ? 'partial'
        : 'unavailable'
      : 'complete'

  return {
    coverage: { status, expected, observed, battles: battleCoverage },
    events: normalizedEvents.map((event) => ({
      eventId: event.eventId,
      battleId: event.battleId,
      occurredAt: event.occurredAt,
      fame: event.fame,
      killer: event.killer,
      victim: event.victim,
    })),
    players: outputPlayers,
  }
}
