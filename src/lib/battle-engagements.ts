import { createHash } from 'node:crypto'
import type { AlbionBattle } from '@/lib/albion-battles'

export const BATTLE_ENGAGEMENT_MIN_FORCE_SIZE = 10
export const BATTLE_ENGAGEMENT_MIN_RESULT_EVENTS = 5
export const BATTLE_ENGAGEMENT_RESULT_MARGIN_PERCENT = 20
export const BATTLE_ENGAGEMENT_CONTINUITY_GAP_MS = 2 * 60 * 1000
export const BATTLE_ENGAGEMENT_CLEAR_BREAK_GAP_MS = 8 * 60 * 1000
const BATTLE_EVENT_TIME_TOLERANCE_MS = 5 * 60 * 1000

export type BattleEngagementRunState =
  | 'collecting'
  | 'ready'
  | 'segmentation_required'
  | 'blocked'

export type BattleEngagementRunReason =
  | 'source_not_stable'
  | 'event_count_incomplete'
  | 'unidentified_event'
  | 'ambiguous_boundary'
  | 'complete'

export type BattleEngagementStatus =
  | 'pending'
  | 'final'
  | 'insufficient_evidence'
  | 'segmentation_required'
  | 'blocked'

export type BattleEngagementResult =
  | 'advantage'
  | 'disadvantage'
  | 'even'

export type BattleEngagementMatchupRole = 'result_eligible' | 'intervention'

export type BattleEngagementEventClassification =
  | 'result_eligible'
  | 'intervention'
  | 'other'
  | 'unidentified'
  | 'not_home_source'

export type BattleEngagementOtherReason =
  | 'guildless'
  | 'force_below_minimum'
  | 'same_home_side'
  | 'not_home_source'
  | null

export interface BattleEngagementEventEvidence {
  eventId: string
  battleId: number | string | null
  role: 'killer' | 'victim'
  sourcePlayerId: string | null
  sourceGuildId: string | null
  sourceAllianceId: string | null
  opponentGuildId: string | null
  opponentGuildName: string | null
  opponentAllianceId: string | null
  opponentAllianceName: string | null
  fame: number
  fameIsObserved: boolean
  occurredAt: string
}

export interface BattleEngagementEventProjection {
  eventId: string
  role: 'killer' | 'victim'
  occurredAt: string
  fame: number
  classification: BattleEngagementEventClassification
  otherReason: BattleEngagementOtherReason
  forceKey: string | null
  forceKind: 'alliance' | 'guild' | null
  forceAlbionId: string | null
  forceName: string | null
  opponentGuildId: string | null
  opponentGuildName: string | null
  opponentAllianceId: string | null
  opponentAllianceName: string | null
}

export interface BattleEngagementMatchupProjection {
  forceKey: string
  forceKind: 'alliance' | 'guild'
  forceAlbionId: string
  forceName: string
  opponentAllianceId: string | null
  opponentTeamSize: number
  role: BattleEngagementMatchupRole
  eventCount: number
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  opponentKills: number
  opponentDeaths: number
  opponentKillFame: number
}

export interface BattleEngagementProjection {
  engagementKey: string
  sequence: number
  startedAt: string
  endedAt: string
  status: BattleEngagementStatus
  result: BattleEngagementResult | null
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  opponentKills: number
  opponentDeaths: number
  opponentKillFame: number
  resultHomeKills: number
  resultHomeDeaths: number
  resultHomeKillFame: number
  resultOpponentKills: number
  resultOpponentDeaths: number
  resultOpponentKillFame: number
  resultEligibleEventCount: number
  interventionEventCount: number
  otherEventCount: number
  homeTeamSize: number
  homeSideTeamSize: number
  isOtherOnly: boolean
  matchups: BattleEngagementMatchupProjection[]
  events: BattleEngagementEventProjection[]
}

export interface BattleEngagementProjectionRun {
  sourceHash: string
  sourceObservationCount: number
  state: BattleEngagementRunState
  reason: BattleEngagementRunReason
  rawHomeKills: number
  rawHomeDeaths: number
  collectedHomeKills: number
  collectedHomeDeaths: number
  unidentifiedEventCount: number
  ignoredNonHomeEventCount: number
  evaluatedAt: string
  engagements: BattleEngagementProjection[]
  unassignedEvents: BattleEngagementEventProjection[]
}

interface ResolvedForce {
  key: string
  kind: 'alliance' | 'guild'
  albionId: string
  name: string
  allianceId: string | null
  teamSize: number
}

interface ResolvedEvent extends BattleEngagementEventProjection {
  occurredAtMs: number
  candidateForce: ResolvedForce | null
}

interface EventBlock {
  events: ResolvedEvent[]
}

function normalizedId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function normalizedName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function normalizedBattleId(value: number | string | null): string | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? String(value) : null
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  return String(BigInt(trimmed))
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

export function hashBattleEngagementSource(battle: AlbionBattle): string {
  return createHash('sha256').update(stableStringify(battle)).digest('hex')
}

function countPlayersForGuild(battle: AlbionBattle, guildId: string): number {
  let count = 0
  for (const player of Object.values(battle.players ?? {})) {
    if (player.guildId === guildId) count += 1
  }
  return count
}

function countPlayersForAlliance(battle: AlbionBattle, allianceId: string): number {
  let count = 0
  for (const player of Object.values(battle.players ?? {})) {
    if (normalizedId(player.allianceId) === allianceId) count += 1
  }
  return count
}

function homeSideTeamSize(
  battle: AlbionBattle,
  homeGuildId: string,
  homeAllianceId: string | null,
): number {
  if (!homeAllianceId) return countPlayersForGuild(battle, homeGuildId)
  return countPlayersForAlliance(battle, homeAllianceId)
}

function eventIdentityKey(event: BattleEngagementEventEvidence): string {
  return `${event.eventId}:${event.role}`
}

function invalidEvent(event: BattleEngagementEventEvidence): ResolvedEvent {
  return {
    eventId: event.eventId,
    role: event.role,
    occurredAt: event.occurredAt,
    occurredAtMs: Date.parse(event.occurredAt),
    fame: event.fame,
    classification: 'unidentified',
    otherReason: null,
    forceKey: null,
    forceKind: null,
    forceAlbionId: null,
    forceName: null,
    opponentGuildId: normalizedId(event.opponentGuildId),
    opponentGuildName: normalizedName(event.opponentGuildName),
    opponentAllianceId: normalizedId(event.opponentAllianceId),
    opponentAllianceName: normalizedName(event.opponentAllianceName),
    candidateForce: null,
  }
}

function resolveEvents(input: {
  battle: AlbionBattle
  homeGuildId: string
  events: ReadonlyArray<BattleEngagementEventEvidence>
}): ResolvedEvent[] {
  const { battle, homeGuildId } = input
  const homeGuild = battle.guilds?.[homeGuildId]
  const homeAllianceId = normalizedId(homeGuild?.allianceId)
  const observedHomeSideTeamSize = homeSideTeamSize(
    battle,
    homeGuildId,
    homeAllianceId,
  )
  const battleId = normalizedBattleId(battle.id)
  const startMs = Date.parse(battle.startTime)
  const endMs = Date.parse(battle.endTime)

  const playerGuildById = new Map<string, string>()
  const playerAllianceById = new Map<string, string | null>()
  for (const [playerKey, player] of Object.entries(battle.players ?? {})) {
    const playerId = normalizedId(player.id) ?? normalizedId(playerKey)
    const guildId = normalizedId(player.guildId)
    if (playerId && guildId) {
      playerGuildById.set(playerId, guildId)
      playerAllianceById.set(playerId, normalizedId(player.allianceId))
    }
  }

  const guildIdsByNormalizedName = new Map<string, string[]>()
  for (const [guildId, guild] of Object.entries(battle.guilds ?? {})) {
    const name = normalizedName(guild.name)
    if (!name) continue
    const key = name.toLocaleLowerCase('en-US')
    const values = guildIdsByNormalizedName.get(key) ?? []
    values.push(guildId)
    guildIdsByNormalizedName.set(key, values)
  }

  const seen = new Map<
    string,
    { fingerprint: string; resolvedIndex: number; conflicted: boolean }
  >()
  const resolved: ResolvedEvent[] = []
  for (const event of input.events) {
    const identityKey = eventIdentityKey(event)
    const fingerprint = stableStringify(event)
    const previous = seen.get(identityKey)
    if (previous?.fingerprint === fingerprint || previous?.conflicted) continue
    if (previous) {
      // 하나의 (event_id, role)에 서로 다른 payload가 들어오면 어느 쪽도
      // 신뢰하지 않는다. 기존 행을 교체해야 DB projection의 unique key를
      // 깨뜨리지 않으면서 blocked 상태 자체는 정상 발행할 수 있다.
      resolved[previous.resolvedIndex] = invalidEvent(event)
      previous.conflicted = true
      continue
    }
    seen.set(identityKey, {
      fingerprint,
      resolvedIndex: resolved.length,
      conflicted: false,
    })

    const occurredAtMs = Date.parse(event.occurredAt)
    const fameIsValid =
      Number.isSafeInteger(event.fame) &&
      event.fame >= 0 &&
      event.fameIsObserved
    const timeIsValid =
      Number.isFinite(occurredAtMs) &&
      Number.isFinite(startMs) &&
      Number.isFinite(endMs) &&
      occurredAtMs >= startMs - BATTLE_EVENT_TIME_TOLERANCE_MS &&
      occurredAtMs <= endMs + BATTLE_EVENT_TIME_TOLERANCE_MS
    if (
      !event.eventId ||
      normalizedBattleId(event.battleId) !== battleId ||
      !fameIsValid ||
      !timeIsValid
    ) {
      resolved.push(invalidEvent(event))
      continue
    }

    const sourcePlayerId = normalizedId(event.sourcePlayerId)
    const sourceGuildFromPlayer = sourcePlayerId
      ? playerGuildById.get(sourcePlayerId) ?? null
      : null
    const sourceGuildId = normalizedId(event.sourceGuildId) ?? sourceGuildFromPlayer
    if (
      !sourcePlayerId ||
      !sourceGuildFromPlayer ||
      !sourceGuildId ||
      sourceGuildId !== sourceGuildFromPlayer
    ) {
      resolved.push(invalidEvent(event))
      continue
    }

    const suppliedSourceAllianceId = normalizedId(event.sourceAllianceId)
    const sourceAllianceFromPlayer = playerAllianceById.get(sourcePlayerId) ?? null
    if (
      suppliedSourceAllianceId !== null &&
      suppliedSourceAllianceId !== sourceAllianceFromPlayer
    ) {
      resolved.push(invalidEvent(event))
      continue
    }

    if (sourceGuildId !== homeGuildId) {
      resolved.push({
        eventId: event.eventId,
        role: event.role,
        occurredAt: event.occurredAt,
        occurredAtMs,
        fame: event.fame,
        classification: 'not_home_source',
        otherReason: 'not_home_source',
        forceKey: null,
        forceKind: null,
        forceAlbionId: null,
        forceName: null,
        opponentGuildId: normalizedId(event.opponentGuildId),
        opponentGuildName: normalizedName(event.opponentGuildName),
        opponentAllianceId: normalizedId(event.opponentAllianceId),
        opponentAllianceName: normalizedName(event.opponentAllianceName),
        candidateForce: null,
      })
      continue
    }

    let opponentGuildId = normalizedId(event.opponentGuildId)
    const opponentGuildName = normalizedName(event.opponentGuildName)
    if (!opponentGuildId && opponentGuildName) {
      const candidates =
        guildIdsByNormalizedName.get(opponentGuildName.toLocaleLowerCase('en-US')) ?? []
      if (candidates.length !== 1) {
        resolved.push(invalidEvent(event))
        continue
      }
      opponentGuildId = candidates[0]
    }

    if (!opponentGuildId) {
      if (opponentGuildName) {
        resolved.push(invalidEvent(event))
        continue
      }
      resolved.push({
        eventId: event.eventId,
        role: event.role,
        occurredAt: event.occurredAt,
        occurredAtMs,
        fame: event.fame,
        classification: 'other',
        otherReason: 'guildless',
        forceKey: null,
        forceKind: null,
        forceAlbionId: null,
        forceName: null,
        opponentGuildId: null,
        opponentGuildName: null,
        opponentAllianceId: normalizedId(event.opponentAllianceId),
        opponentAllianceName: normalizedName(event.opponentAllianceName),
        candidateForce: null,
      })
      continue
    }

    const opponentGuild = battle.guilds?.[opponentGuildId]
    if (!opponentGuild) {
      resolved.push(invalidEvent(event))
      continue
    }

    const rawOpponentAllianceId = normalizedId(opponentGuild.allianceId)
    const suppliedOpponentAllianceId = normalizedId(event.opponentAllianceId)
    if (
      suppliedOpponentAllianceId &&
      suppliedOpponentAllianceId !== rawOpponentAllianceId
    ) {
      resolved.push(invalidEvent(event))
      continue
    }
    const opponentAllianceId = suppliedOpponentAllianceId ?? rawOpponentAllianceId
    const opponentAllianceName =
      normalizedName(event.opponentAllianceName) ??
      (opponentAllianceId
        ? normalizedName(battle.alliances?.[opponentAllianceId]?.name)
        : null)

    const sameHomeSide =
      opponentGuildId === homeGuildId ||
      (homeAllianceId !== null && opponentAllianceId === homeAllianceId)
    if (sameHomeSide) {
      resolved.push({
        eventId: event.eventId,
        role: event.role,
        occurredAt: event.occurredAt,
        occurredAtMs,
        fame: event.fame,
        classification: 'other',
        otherReason: 'same_home_side',
        forceKey: null,
        forceKind: null,
        forceAlbionId: null,
        forceName: null,
        opponentGuildId,
        opponentGuildName: normalizedName(opponentGuild.name),
        opponentAllianceId,
        opponentAllianceName,
        candidateForce: null,
      })
      continue
    }

    const force: ResolvedForce = opponentAllianceId
      ? {
          key: `a:${opponentAllianceId}`,
          kind: 'alliance',
          albionId: opponentAllianceId,
          name:
            normalizedName(battle.alliances?.[opponentAllianceId]?.name) ??
            opponentAllianceName ??
            normalizedName(opponentGuild.name) ??
            opponentAllianceId,
          allianceId: opponentAllianceId,
          teamSize: countPlayersForAlliance(battle, opponentAllianceId),
        }
      : {
          key: `g:${opponentGuildId}`,
          kind: 'guild',
          albionId: opponentGuildId,
          name: normalizedName(opponentGuild.name) ?? opponentGuildId,
          allianceId: null,
          teamSize: countPlayersForGuild(battle, opponentGuildId),
        }

    if (
      force.teamSize < BATTLE_ENGAGEMENT_MIN_FORCE_SIZE ||
      observedHomeSideTeamSize < BATTLE_ENGAGEMENT_MIN_FORCE_SIZE
    ) {
      resolved.push({
        eventId: event.eventId,
        role: event.role,
        occurredAt: event.occurredAt,
        occurredAtMs,
        fame: event.fame,
        classification: 'other',
        otherReason: 'force_below_minimum',
        forceKey: force.key,
        forceKind: force.kind,
        forceAlbionId: force.albionId,
        forceName: force.name,
        opponentGuildId,
        opponentGuildName: normalizedName(opponentGuild.name),
        opponentAllianceId,
        opponentAllianceName,
        candidateForce: null,
      })
      continue
    }

    resolved.push({
      eventId: event.eventId,
      role: event.role,
      occurredAt: event.occurredAt,
      occurredAtMs,
      fame: event.fame,
      classification: 'result_eligible',
      otherReason: null,
      forceKey: force.key,
      forceKind: force.kind,
      forceAlbionId: force.albionId,
      forceName: force.name,
      opponentGuildId,
      opponentGuildName: normalizedName(opponentGuild.name),
      opponentAllianceId,
      opponentAllianceName,
      candidateForce: force,
    })
  }
  return resolved.sort((a, b) => {
    if (a.occurredAtMs !== b.occurredAtMs) return a.occurredAtMs - b.occurredAtMs
    return `${a.eventId}:${a.role}`.localeCompare(`${b.eventId}:${b.role}`)
  })
}

function splitEventBlocks(events: ReadonlyArray<ResolvedEvent>): {
  blocks: EventBlock[]
  hasAmbiguousBoundary: boolean
} {
  if (events.length === 0) return { blocks: [], hasAmbiguousBoundary: false }

  const blocks: EventBlock[] = [{ events: [events[0]] }]
  let hasAmbiguousBoundary = false
  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1]
    const current = events[index]
    const gapMs = current.occurredAtMs - previous.occurredAtMs
    if (gapMs <= BATTLE_ENGAGEMENT_CONTINUITY_GAP_MS) {
      blocks[blocks.length - 1].events.push(current)
      continue
    }
    if (gapMs < BATTLE_ENGAGEMENT_CLEAR_BREAK_GAP_MS) {
      hasAmbiguousBoundary = true
    }
    blocks.push({ events: [current] })
  }
  return { blocks, hasAmbiguousBoundary }
}

function totals(events: ReadonlyArray<ResolvedEvent>): {
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  opponentKills: number
  opponentDeaths: number
  opponentKillFame: number
} {
  let homeKills = 0
  let homeDeaths = 0
  let homeKillFame = 0
  let opponentKillFame = 0
  for (const event of events) {
    if (event.role === 'killer') {
      homeKills += 1
      homeKillFame += event.fame
    } else {
      homeDeaths += 1
      opponentKillFame += event.fame
    }
  }
  return {
    homeKills,
    homeDeaths,
    homeKillFame,
    opponentKills: homeDeaths,
    opponentDeaths: homeKills,
    opponentKillFame,
  }
}

function leadsByMargin(leader: number, trailing: number): boolean {
  if (leader <= trailing) return false
  if (trailing === 0) return leader > 0
  return leader * 100 >= trailing * (100 + BATTLE_ENGAGEMENT_RESULT_MARGIN_PERCENT)
}

export function judgeBattleEngagementResult(input: {
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  opponentKillFame: number
  eligibleEventCount: number
}): BattleEngagementResult | null {
  if (input.eligibleEventCount < BATTLE_ENGAGEMENT_MIN_RESULT_EVENTS) return null

  const homeLeadsKills = leadsByMargin(input.homeKills, input.homeDeaths)
  const homeLeadsFame = leadsByMargin(input.homeKillFame, input.opponentKillFame)
  if (homeLeadsKills && homeLeadsFame) return 'advantage'

  const opponentLeadsKills = leadsByMargin(input.homeDeaths, input.homeKills)
  const opponentLeadsFame = leadsByMargin(input.opponentKillFame, input.homeKillFame)
  if (opponentLeadsKills && opponentLeadsFame) return 'disadvantage'

  return 'even'
}

function engagementKey(events: ReadonlyArray<ResolvedEvent>): string {
  const identity = events
    .map((event) => `${event.eventId}:${event.role}`)
    .sort()
    .join('|')
  return createHash('sha256').update(identity).digest('hex')
}

function withoutInternalFields(event: ResolvedEvent): BattleEngagementEventProjection {
  return {
    eventId: event.eventId,
    role: event.role,
    occurredAt: event.occurredAt,
    fame: event.fame,
    classification: event.classification,
    otherReason: event.otherReason,
    forceKey: event.forceKey,
    forceKind: event.forceKind,
    forceAlbionId: event.forceAlbionId,
    forceName: event.forceName,
    opponentGuildId: event.opponentGuildId,
    opponentGuildName: event.opponentGuildName,
    opponentAllianceId: event.opponentAllianceId,
    opponentAllianceName: event.opponentAllianceName,
  }
}

function projectBlock(input: {
  block: EventBlock
  sequence: number
  runState: BattleEngagementRunState
  battle: AlbionBattle
  homeGuildId: string
}): BattleEngagementProjection {
  const candidateEvents = input.block.events.filter((event) => event.candidateForce !== null)
  const countsByForce = new Map<string, number>()
  for (const event of candidateEvents) {
    const forceKey = event.candidateForce!.key
    countsByForce.set(forceKey, (countsByForce.get(forceKey) ?? 0) + 1)
  }
  const hasMainForce = [...countsByForce.values()].some((count) => count >= 2)
  const hasMultipleForces = countsByForce.size > 1
  const interventionForceKeys = new Set(
    [...countsByForce.entries()]
      .filter(([, count]) => hasMultipleForces && hasMainForce && count === 1)
      .map(([forceKey]) => forceKey),
  )

  for (const event of candidateEvents) {
    event.classification = interventionForceKeys.has(event.candidateForce!.key)
      ? 'intervention'
      : 'result_eligible'
  }

  const factualEvents = input.block.events.filter(
    (event) =>
      event.classification !== 'unidentified' &&
      event.classification !== 'not_home_source',
  )
  const resultEvents = factualEvents.filter(
    (event) => event.classification === 'result_eligible',
  )
  const factualTotals = totals(factualEvents)
  const resultTotals = totals(resultEvents)
  const result = judgeBattleEngagementResult({
    homeKills: resultTotals.homeKills,
    homeDeaths: resultTotals.homeDeaths,
    homeKillFame: resultTotals.homeKillFame,
    opponentKillFame: resultTotals.opponentKillFame,
    eligibleEventCount: resultEvents.length,
  })

  let status: BattleEngagementStatus
  if (input.runState === 'collecting') status = 'pending'
  else if (input.runState === 'blocked') status = 'blocked'
  else if (input.runState === 'segmentation_required') status = 'segmentation_required'
  else if (result === null) status = 'insufficient_evidence'
  else status = 'final'

  const matchupEvents = new Map<string, ResolvedEvent[]>()
  for (const event of candidateEvents) {
    const forceKey = event.candidateForce!.key
    const values = matchupEvents.get(forceKey) ?? []
    values.push(event)
    matchupEvents.set(forceKey, values)
  }

  const matchups = [...matchupEvents.entries()]
    .map(([forceKey, events]): BattleEngagementMatchupProjection => {
      const force = events[0].candidateForce!
      const matchupTotals = totals(events)
      return {
        forceKey,
        forceKind: force.kind,
        forceAlbionId: force.albionId,
        forceName: force.name,
        opponentAllianceId: force.allianceId,
        opponentTeamSize: force.teamSize,
        role: interventionForceKeys.has(forceKey) ? 'intervention' : 'result_eligible',
        eventCount: events.length,
        ...matchupTotals,
      }
    })
    .sort((a, b) => {
      if (a.role !== b.role) return a.role === 'result_eligible' ? -1 : 1
      if (b.eventCount !== a.eventCount) return b.eventCount - a.eventCount
      return a.forceKey.localeCompare(b.forceKey)
    })

  const homeGuild = input.battle.guilds?.[input.homeGuildId]
  const homeAllianceId = normalizedId(homeGuild?.allianceId)
  const firstEvent = factualEvents[0] ?? input.block.events[0]
  const lastEvent = factualEvents[factualEvents.length - 1] ??
    input.block.events[input.block.events.length - 1]
  const startedAt = firstEvent?.occurredAt ?? input.battle.startTime
  const endedAt = lastEvent?.occurredAt ?? input.battle.endTime

  return {
    engagementKey: engagementKey(input.block.events),
    sequence: input.sequence,
    startedAt,
    endedAt,
    status,
    result: status === 'final' ? result : null,
    ...factualTotals,
    resultHomeKills: resultTotals.homeKills,
    resultHomeDeaths: resultTotals.homeDeaths,
    resultHomeKillFame: resultTotals.homeKillFame,
    resultOpponentKills: resultTotals.opponentKills,
    resultOpponentDeaths: resultTotals.opponentDeaths,
    resultOpponentKillFame: resultTotals.opponentKillFame,
    resultEligibleEventCount: resultEvents.length,
    interventionEventCount: factualEvents.filter(
      (event) => event.classification === 'intervention',
    ).length,
    otherEventCount: factualEvents.filter(
      (event) => event.classification === 'other',
    ).length,
    homeTeamSize: countPlayersForGuild(input.battle, input.homeGuildId),
    homeSideTeamSize: homeSideTeamSize(
      input.battle,
      input.homeGuildId,
      homeAllianceId,
    ),
    isOtherOnly: candidateEvents.length === 0,
    matchups,
    events: input.block.events.map(withoutInternalFields),
  }
}

export function buildBattleEngagementProjection(input: {
  battle: AlbionBattle
  homeGuildId: string
  events: ReadonlyArray<BattleEngagementEventEvidence>
  sourceObservationCount: number
  evaluatedAt: string
}): BattleEngagementProjectionRun {
  const sourceHash = hashBattleEngagementSource(input.battle)
  const homeGuild = input.battle.guilds?.[input.homeGuildId]
  const rawHomeKills = Math.max(0, Math.floor(homeGuild?.kills ?? 0))
  const rawHomeDeaths = Math.max(0, Math.floor(homeGuild?.deaths ?? 0))
  const resolvedEvents = resolveEvents(input)
  const homeEvents = resolvedEvents.filter(
    (event) => event.classification !== 'not_home_source',
  )
  const validHomeEvents = homeEvents.filter(
    (event) => event.classification !== 'unidentified',
  )
  const collectedHomeKills = validHomeEvents.filter(
    (event) => event.role === 'killer',
  ).length
  const collectedHomeDeaths = validHomeEvents.filter(
    (event) => event.role === 'victim',
  ).length
  const unidentifiedEventCount = homeEvents.filter(
    (event) => event.classification === 'unidentified',
  ).length
  const ignoredNonHomeEventCount = resolvedEvents.filter(
    (event) => event.classification === 'not_home_source',
  ).length

  // 교전 경계는 결과 포함 여부와 무관하게 모든 유효한 직접 K/D로 정한다.
  // 10명 미만·길드 없음 같은 이벤트도 실제 흐름을 증명하므로, 멀리 떨어진
  // 기타 로그가 하나의 교전으로 합쳐지면 안 된다.
  const split = splitEventBlocks(validHomeEvents)
  const blocks = split.blocks

  let state: BattleEngagementRunState
  let reason: BattleEngagementRunReason
  if (input.sourceObservationCount < 2) {
    state = 'collecting'
    reason = 'source_not_stable'
  } else if (unidentifiedEventCount > 0) {
    state = 'blocked'
    reason = 'unidentified_event'
  } else if (
    collectedHomeKills !== rawHomeKills ||
    collectedHomeDeaths !== rawHomeDeaths
  ) {
    state = 'collecting'
    reason = 'event_count_incomplete'
  } else if (split.hasAmbiguousBoundary) {
    state = 'segmentation_required'
    reason = 'ambiguous_boundary'
  } else {
    state = 'ready'
    reason = 'complete'
  }

  const engagements = blocks.map((block, index) =>
    projectBlock({
      block,
      sequence: index + 1,
      runState: state,
      battle: input.battle,
      homeGuildId: input.homeGuildId,
    }),
  )
  const assignedEventKeys = new Set(
    engagements.flatMap((engagement) =>
      engagement.events.map((event) => `${event.eventId}:${event.role}`),
    ),
  )
  const unassignedEvents = resolvedEvents
    .filter((event) => !assignedEventKeys.has(`${event.eventId}:${event.role}`))
    .map(withoutInternalFields)

  return {
    sourceHash,
    sourceObservationCount: Math.max(0, Math.floor(input.sourceObservationCount)),
    state,
    reason,
    rawHomeKills,
    rawHomeDeaths,
    collectedHomeKills,
    collectedHomeDeaths,
    unidentifiedEventCount,
    ignoredNonHomeEventCount,
    evaluatedAt: input.evaluatedAt,
    engagements,
    unassignedEvents,
  }
}
