import { createHash } from 'node:crypto'
import type { AlbionServer } from '@/lib/albion-gameinfo'
import {
  BATTLE_ENGAGEMENT_CLEAR_BREAK_GAP_MS,
  BATTLE_ENGAGEMENT_CONTINUITY_GAP_MS,
  BATTLE_ENGAGEMENT_MIN_RESULT_EVENTS,
  BATTLE_ENGAGEMENT_MIN_SIDE_SIZE,
  judgeBattleEngagementResult,
  type BattleEngagementResult,
} from '@/lib/battle-engagements'
import {
  computeBattleForceSummaries,
  type AlbionBattle,
  type BattleForceSummary,
} from '@/lib/albion-battles'
import type {
  PublicBattleAnalysisActor,
  PublicBattleProjectionEvent,
} from '@/lib/public-battle-analysis-model'

export const PUBLIC_ZVZ_V2_FORMULA_VERSION = 'agm_zvz_v2'
export const PUBLIC_ZVZ_V3_FORMULA_VERSION = 'agm_zvz_v3'
export const PUBLIC_ZVZ_V2_BATTLE_POINTS = 25
export const PUBLIC_ZVZ_V2_COMBAT_CURVE = 30
export const PUBLIC_ZVZ_V3_EFFICIENCY_CURVE = 1
export const PUBLIC_ZVZ_V2_ACTIVITY_FULL_CREDIT = 10
const PUBLIC_ZVZ_COMPARABLE_SCALE_RATIO_NUMERATOR = 3
const PUBLIC_ZVZ_COMPARABLE_SCALE_RATIO_DENOMINATOR = 4
export const PUBLIC_ZVZ_COMPARABLE_SCALE_MIN_RATIO =
  PUBLIC_ZVZ_COMPARABLE_SCALE_RATIO_NUMERATOR /
  PUBLIC_ZVZ_COMPARABLE_SCALE_RATIO_DENOMINATOR

export const PUBLIC_ZVZ_RANKING_ENTITY_KINDS = ['alliance', 'guild'] as const
export type PublicZvzRankingEntityKind = (typeof PUBLIC_ZVZ_RANKING_ENTITY_KINDS)[number]
export const PUBLIC_ZVZ_RANKING_SERVERS = ['west', 'europe', 'east'] as const satisfies readonly AlbionServer[]

export const PUBLIC_ZVZ_RANKING_SCOPES = [
  'overall',
  'small',
  'mid',
  'large',
  'zerg',
] as const
export type PublicZvzRankingScope = (typeof PUBLIC_ZVZ_RANKING_SCOPES)[number]
export type PublicZvzEngagementScale = Exclude<PublicZvzRankingScope, 'overall'>

export const PUBLIC_ZVZ_PRIMARY_SCALE_MIN_ENGAGEMENTS = 2

const PUBLIC_ZVZ_ENGAGEMENT_SCALES_ASCENDING: readonly PublicZvzEngagementScale[] = [
  'small',
  'mid',
  'large',
  'zerg',
]

export function selectPublicZvzPrimaryEngagementScale(
  rollups: ReadonlyArray<{
    scope: PublicZvzRankingScope
    engagementCount: number
  }>,
): PublicZvzEngagementScale | null {
  for (const scale of [...PUBLIC_ZVZ_ENGAGEMENT_SCALES_ASCENDING].reverse()) {
    const rollup = rollups.find((candidate) => candidate.scope === scale)
    if (
      rollup &&
      rollup.engagementCount >= PUBLIC_ZVZ_PRIMARY_SCALE_MIN_ENGAGEMENTS
    ) {
      return scale
    }
  }
  return null
}

export type PublicZvzProjectionCoverage = 'complete' | 'partial' | 'unavailable'
export type PublicZvzProjectionStatus =
  | 'final'
  | 'partial_source'
  | 'segmentation_required'
  | 'below_official_size'
  | 'low_engagement'
  | 'insufficient_evidence'

export interface PublicZvzProjectedMatchup {
  opponentForceKey: string
  opponentForceKind: 'alliance' | 'guild'
  opponentAlbionId: string
  opponentName: string
  opponentAllianceId: string | null
  opponentTeamSize: number
  role: 'result_eligible' | 'intervention'
  eventCount: number
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  opponentKillFame: number
}

export interface PublicZvzProjectedEntityEvidence {
  entityKind: PublicZvzRankingEntityKind
  entityAlbionId: string
  entityName: string
  allianceAlbionId: string | null
  allianceName: string | null
  ownTeamSize: number
  sideTeamSize: number
  participationShare: number
  battleCredit: number
  battlePoints: number
  kills: number
  deaths: number
  killFame: number
  averageItemPower: number | null
  itemPowerSampleCount: number
  participationKind: 'standalone' | 'single_guild_sortie' | 'joint_sortie'
}

export interface PublicZvzProjectedEngagement {
  engagementKey: string
  sequence: number
  startedAt: string
  endedAt: string
  status: PublicZvzProjectionStatus
  result: BattleEngagementResult | null
  homeForceKey: string
  homeForceKind: 'alliance' | 'guild'
  homeForceAlbionId: string
  homeForceName: string
  homeAllianceId: string | null
  homeAllianceName: string | null
  homeSideTeamSize: number
  opponentSideTeamSize: number
  scale: PublicZvzEngagementScale
  scaleRankingEligible: boolean
  homeKills: number
  homeDeaths: number
  homeKillFame: number
  opponentKillFame: number
  resultEventCount: number
  interventionEventCount: number
  eventIds: string[]
  matchups: PublicZvzProjectedMatchup[]
  evidence: PublicZvzProjectedEntityEvidence[]
}

export interface PublicZvzBattleProjection {
  sourceHash: string
  coverage: PublicZvzProjectionCoverage
  engagements: PublicZvzProjectedEngagement[]
}

export interface PublicZvzScoreEvidence {
  ownTeamSize: number
  sideTeamSize: number
  opponentSideTeamSize: number
  battleCredit: number
  kills: number
  deaths: number
  killFame: number
}

export interface PublicZvzScoreBreakdown {
  score: number
  representativeSize: number
  combatIndex: number
  efficiencyIndex: number
  equivalentBattles: number
  sizePoints: number
  combatPoints: number
  efficiencyPoints: number
  activityPoints: number
}

interface DirectEvent {
  event: PublicBattleProjectionEvent
  role: 'killer' | 'victim'
  opponent: BattleForceSummary
}

interface EventBlock {
  events: DirectEvent[]
  ambiguousBoundary: boolean
}

function finiteCount(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0
}

function forceAlbionId(force: BattleForceSummary): string {
  if (force.allianceId) return force.allianceId
  return force.guildIds[0] ?? force.forceKey.replace(/^[ag]:/, '')
}

function actorForceKey(actor: PublicBattleAnalysisActor): string {
  return actor.allianceId ? `a:${actor.allianceId}` : `g:${actor.guildId}`
}

function actorBelongsToForce(
  actor: PublicBattleAnalysisActor,
  force: BattleForceSummary,
): boolean {
  return actorForceKey(actor) === force.forceKey
}

function observedPlayersForForce(
  events: readonly DirectEvent[],
  force: BattleForceSummary,
): Map<string, PublicBattleAnalysisActor> {
  const players = new Map<string, PublicBattleAnalysisActor>()
  for (const direct of events) {
    for (const actor of direct.event.observations) {
      if (!actorBelongsToForce(actor, force)) continue
      players.set(actor.playerId, actor)
    }
  }
  return players
}

function directEventsForForce(
  events: readonly PublicBattleProjectionEvent[],
  force: BattleForceSummary,
  forceByKey: ReadonlyMap<string, BattleForceSummary>,
): DirectEvent[] {
  const direct: DirectEvent[] = []
  for (const event of events) {
    const killerIsHome = actorBelongsToForce(event.killer, force)
    const victimIsHome = actorBelongsToForce(event.victim, force)
    if (killerIsHome === victimIsHome) continue
    const opponentActor = killerIsHome ? event.victim : event.killer
    const opponent = forceByKey.get(actorForceKey(opponentActor))
    if (!opponent || opponent.forceKey === force.forceKey) continue
    direct.push({
      event,
      role: killerIsHome ? 'killer' : 'victim',
      opponent,
    })
  }
  return direct.sort((a, b) => {
    const time = Date.parse(a.event.occurredAt) - Date.parse(b.event.occurredAt)
    if (time !== 0) return time
    return Number(a.event.eventId) - Number(b.event.eventId)
  })
}

function splitEventBlocks(events: readonly DirectEvent[]): EventBlock[] {
  if (events.length === 0) return []
  const blocks: EventBlock[] = [{ events: [events[0]], ambiguousBoundary: false }]
  for (let index = 1; index < events.length; index += 1) {
    const previous = events[index - 1]
    const current = events[index]
    const gap = Date.parse(current.event.occurredAt) - Date.parse(previous.event.occurredAt)
    if (gap <= BATTLE_ENGAGEMENT_CONTINUITY_GAP_MS) {
      blocks[blocks.length - 1].events.push(current)
      continue
    }
    const ambiguous = gap < BATTLE_ENGAGEMENT_CLEAR_BREAK_GAP_MS
    if (ambiguous) blocks[blocks.length - 1].ambiguousBoundary = true
    blocks.push({ events: [current], ambiguousBoundary: ambiguous })
  }
  return blocks
}

function totals(events: readonly DirectEvent[]) {
  let homeKills = 0
  let homeDeaths = 0
  let homeKillFame = 0
  let opponentKillFame = 0
  for (const event of events) {
    if (event.role === 'killer') {
      homeKills += 1
      homeKillFame += finiteCount(event.event.fame)
    } else {
      homeDeaths += 1
      opponentKillFame += finiteCount(event.event.fame)
    }
  }
  return { homeKills, homeDeaths, homeKillFame, opponentKillFame }
}

function isLowEngagement(teamSize: number, kills: number, deaths: number): boolean {
  return kills + deaths < teamSize * 0.1 && deaths < 3
}

export function classifyPublicZvzEngagementScale(teamSize: number): PublicZvzEngagementScale {
  if (teamSize <= 20) return 'small'
  if (teamSize <= 40) return 'mid'
  if (teamSize <= 80) return 'large'
  return 'zerg'
}

export interface PublicZvzEngagementScaleMatchAssessment {
  scale: PublicZvzEngagementScale
  scaleRankingEligible: boolean
  similarityRatio: number
}

export function assessPublicZvzEngagementScaleMatch(
  homeSideTeamSize: number,
  opponentSideTeamSize: number,
): PublicZvzEngagementScaleMatchAssessment {
  const homeSize = Number.isFinite(homeSideTeamSize)
    ? Math.max(0, Math.floor(homeSideTeamSize))
    : 0
  const opponentSize = Number.isFinite(opponentSideTeamSize)
    ? Math.max(0, Math.floor(opponentSideTeamSize))
    : 0
  const largerSideSize = Math.max(homeSize, opponentSize)
  const smallerSideSize = Math.min(homeSize, opponentSize)
  return {
    scale: classifyPublicZvzEngagementScale(largerSideSize),
    scaleRankingEligible:
      smallerSideSize >= BATTLE_ENGAGEMENT_MIN_SIDE_SIZE &&
      smallerSideSize * PUBLIC_ZVZ_COMPARABLE_SCALE_RATIO_DENOMINATOR >=
        largerSideSize * PUBLIC_ZVZ_COMPARABLE_SCALE_RATIO_NUMERATOR,
    similarityRatio: largerSideSize > 0 ? smallerSideSize / largerSideSize : 0,
  }
}

function projectionStatus(input: {
  coverage: PublicZvzProjectionCoverage
  ambiguous: boolean
  homeTeamSize: number
  opponentTeamSize: number
  homeKills: number
  homeDeaths: number
  resultEventCount: number
}): PublicZvzProjectionStatus {
  if (input.coverage !== 'complete') return 'partial_source'
  if (input.ambiguous) return 'segmentation_required'
  if (
    input.homeTeamSize < BATTLE_ENGAGEMENT_MIN_SIDE_SIZE ||
    input.opponentTeamSize < BATTLE_ENGAGEMENT_MIN_SIDE_SIZE
  ) {
    return 'below_official_size'
  }
  if (
    isLowEngagement(input.homeTeamSize, input.homeKills, input.homeDeaths) ||
    isLowEngagement(
      input.opponentTeamSize,
      input.homeDeaths,
      input.homeKills,
    )
  ) {
    return 'low_engagement'
  }
  if (input.resultEventCount < BATTLE_ENGAGEMENT_MIN_RESULT_EVENTS) {
    return 'insufficient_evidence'
  }
  return 'final'
}

function buildMatchups(
  events: readonly DirectEvent[],
  interventionKeys: ReadonlySet<string>,
  observedTeamSizeByForce: ReadonlyMap<string, number>,
): PublicZvzProjectedMatchup[] {
  const byForce = new Map<string, DirectEvent[]>()
  for (const event of events) {
    const current = byForce.get(event.opponent.forceKey) ?? []
    current.push(event)
    byForce.set(event.opponent.forceKey, current)
  }
  return Array.from(byForce.entries())
    .map(([key, forceEvents]): PublicZvzProjectedMatchup => {
      const force = forceEvents[0].opponent
      const values = totals(forceEvents)
      return {
        opponentForceKey: key,
        opponentForceKind: force.forceKind,
        opponentAlbionId: forceAlbionId(force),
        opponentName: force.forceName,
        opponentAllianceId: force.allianceId,
        opponentTeamSize: observedTeamSizeByForce.get(key) ?? 0,
        role: interventionKeys.has(key) ? 'intervention' : 'result_eligible',
        eventCount: forceEvents.length,
        ...values,
      }
    })
    .sort((a, b) => (
      (a.role === b.role ? 0 : a.role === 'result_eligible' ? -1 : 1) ||
      b.eventCount - a.eventCount ||
      a.opponentForceKey.localeCompare(b.opponentForceKey)
    ))
}

function observedGuildEvidence(input: {
  home: BattleForceSummary
  resultEvents: readonly DirectEvent[]
  totals: ReturnType<typeof totals>
  sideTeamSize: number
}): PublicZvzProjectedEntityEvidence[] {
  const observedPlayersByGuild = new Map<string, Map<string, PublicBattleAnalysisActor>>()
  for (const direct of input.resultEvents) {
    for (const actor of direct.event.observations) {
      if (!actor.guildId || !actorBelongsToForce(actor, input.home)) continue
      const players = observedPlayersByGuild.get(actor.guildId) ?? new Map()
      players.set(actor.playerId, actor)
      observedPlayersByGuild.set(actor.guildId, players)
    }
  }

  const guildStats = new Map<string, { kills: number; deaths: number; killFame: number }>()
  for (const direct of input.resultEvents) {
    const homeActor = direct.role === 'killer' ? direct.event.killer : direct.event.victim
    if (!homeActor.guildId) continue
    const current = guildStats.get(homeActor.guildId) ?? { kills: 0, deaths: 0, killFame: 0 }
    if (direct.role === 'killer') {
      current.kills += 1
      current.killFame += finiteCount(direct.event.fame)
    } else {
      current.deaths += 1
    }
    guildStats.set(homeActor.guildId, current)
  }

  const observedGuildCount = observedPlayersByGuild.size
  const participationKind = input.home.forceKind === 'guild'
    ? 'standalone'
    : observedGuildCount >= 2
      ? 'joint_sortie'
      : 'single_guild_sortie'
  const evidence: PublicZvzProjectedEntityEvidence[] = []
  const observedItemPowers = Array.from(observedPlayersByGuild.values())
    .flatMap((players) => Array.from(players.values()))
    .map((actor) => actor.itemPower)
    .filter((itemPower): itemPower is number => (
      itemPower !== null && Number.isFinite(itemPower) && itemPower > 0
    ))

  if (
    input.home.forceKind === 'alliance' &&
    input.home.allianceId &&
    participationKind === 'joint_sortie'
  ) {
    evidence.push({
      entityKind: 'alliance',
      entityAlbionId: input.home.allianceId,
      entityName: input.home.forceName,
      allianceAlbionId: input.home.allianceId,
      allianceName: input.home.allianceName,
      ownTeamSize: input.sideTeamSize,
      sideTeamSize: input.sideTeamSize,
      participationShare: 1,
      battleCredit: 1,
      battlePoints: PUBLIC_ZVZ_V2_BATTLE_POINTS,
      kills: input.totals.homeKills,
      deaths: input.totals.homeDeaths,
      killFame: input.totals.homeKillFame,
      averageItemPower: observedItemPowers.length > 0
        ? observedItemPowers.reduce((sum, itemPower) => sum + itemPower, 0) /
          observedItemPowers.length
        : null,
      itemPowerSampleCount: observedItemPowers.length,
      participationKind,
    })
  }

  for (const [guildId, players] of observedPlayersByGuild) {
    const firstActor = players.values().next().value as PublicBattleAnalysisActor | undefined
    const ownTeamSize = players.size
    if (!firstActor || ownTeamSize < 1) continue
    const share = Math.min(1, ownTeamSize / Math.max(1, input.sideTeamSize))
    const stats = guildStats.get(guildId) ?? { kills: 0, deaths: 0, killFame: 0 }
    const itemPowers = Array.from(players.values())
      .map((actor) => actor.itemPower)
      .filter((itemPower): itemPower is number => (
        itemPower !== null && Number.isFinite(itemPower) && itemPower > 0
      ))
    evidence.push({
      entityKind: 'guild',
      entityAlbionId: guildId,
      entityName: firstActor.guildName,
      allianceAlbionId: firstActor.allianceId,
      allianceName: firstActor.allianceName,
      ownTeamSize,
      sideTeamSize: input.sideTeamSize,
      participationShare: share,
      battleCredit: share,
      battlePoints: PUBLIC_ZVZ_V2_BATTLE_POINTS * share,
      ...stats,
      averageItemPower: itemPowers.length > 0
        ? itemPowers.reduce((sum, itemPower) => sum + itemPower, 0) /
          itemPowers.length
        : null,
      itemPowerSampleCount: itemPowers.length,
      participationKind,
    })
  }

  return evidence.sort((a, b) => (
    (a.entityKind === b.entityKind ? 0 : a.entityKind === 'alliance' ? -1 : 1) ||
    b.ownTeamSize - a.ownTeamSize ||
    a.entityName.localeCompare(b.entityName)
  ))
}

function projectBlock(input: {
  home: BattleForceSummary
  block: EventBlock
  sequence: number
  coverage: PublicZvzProjectionCoverage
}): PublicZvzProjectedEngagement {
  const countByOpponent = new Map<string, number>()
  for (const direct of input.block.events) {
    countByOpponent.set(
      direct.opponent.forceKey,
      (countByOpponent.get(direct.opponent.forceKey) ?? 0) + 1,
    )
  }
  const multipleForces = countByOpponent.size > 1
  const hasMainForce = Array.from(countByOpponent.values()).some((count) => count >= 2)
  const interventionKeys = new Set(
    Array.from(countByOpponent.entries())
      .filter(([, count]) => multipleForces && hasMainForce && count === 1)
      .map(([key]) => key),
  )
  const opponentByKey = new Map(
    input.block.events.map((direct) => [direct.opponent.forceKey, direct.opponent]),
  )
  const resultEvents = input.block.events.filter(
    (direct) => !interventionKeys.has(direct.opponent.forceKey),
  )
  const homeSideTeamSize = observedPlayersForForce(resultEvents, input.home).size
  const observedTeamSizeByForce = new Map(
    Array.from(opponentByKey.entries()).map(([key, force]) => [
      key,
      observedPlayersForForce(input.block.events, force).size,
    ]),
  )
  const opponentSideTeamSize = Array.from(opponentByKey.keys())
    .filter((key) => !interventionKeys.has(key))
    .reduce((sum, key) => sum + (observedTeamSizeByForce.get(key) ?? 0), 0)
  const scaleMatch = assessPublicZvzEngagementScaleMatch(
    homeSideTeamSize,
    opponentSideTeamSize,
  )
  const resultTotals = totals(resultEvents)
  const status = projectionStatus({
    coverage: input.coverage,
    ambiguous: input.block.ambiguousBoundary,
    homeTeamSize: homeSideTeamSize,
    opponentTeamSize: opponentSideTeamSize,
    homeKills: resultTotals.homeKills,
    homeDeaths: resultTotals.homeDeaths,
    resultEventCount: resultEvents.length,
  })
  const result = status === 'final'
    ? judgeBattleEngagementResult({
        homeKills: resultTotals.homeKills,
        homeDeaths: resultTotals.homeDeaths,
        homeKillFame: resultTotals.homeKillFame,
        opponentKillFame: resultTotals.opponentKillFame,
        eligibleEventCount: resultEvents.length,
      })
    : null
  const first = input.block.events[0].event
  const last = input.block.events[input.block.events.length - 1].event
  const eventIds = input.block.events.map((direct) => direct.event.eventId).sort()
  const engagementKey = createHash('sha256')
    .update(`${input.home.forceKey}|${eventIds.join('|')}`)
    .digest('hex')

  return {
    engagementKey,
    sequence: input.sequence,
    startedAt: first.occurredAt,
    endedAt: last.occurredAt,
    status,
    result,
    homeForceKey: input.home.forceKey,
    homeForceKind: input.home.forceKind,
    homeForceAlbionId: forceAlbionId(input.home),
    homeForceName: input.home.forceName,
    homeAllianceId: input.home.allianceId,
    homeAllianceName: input.home.allianceName,
    homeSideTeamSize,
    opponentSideTeamSize,
    scale: scaleMatch.scale,
    scaleRankingEligible: status === 'final' && scaleMatch.scaleRankingEligible,
    ...resultTotals,
    resultEventCount: resultEvents.length,
    interventionEventCount: input.block.events.length - resultEvents.length,
    eventIds,
    matchups: buildMatchups(
      input.block.events,
      interventionKeys,
      observedTeamSizeByForce,
    ),
    evidence: status === 'final'
      ? observedGuildEvidence({
          home: input.home,
          resultEvents,
          totals: resultTotals,
          sideTeamSize: homeSideTeamSize,
        })
      : [],
  }
}

export function isPublicZvzProjectionCandidate(battle: AlbionBattle): boolean {
  const forces = computeBattleForceSummaries(battle).filter(
    (force) => force.forceLevel === 'alliance' && force.teamSize > 0,
  )
  return forces.some((home) => (
    home.teamSize >= BATTLE_ENGAGEMENT_MIN_SIDE_SIZE &&
    forces
      .filter((force) => force.forceKey !== home.forceKey)
      .reduce((sum, force) => sum + force.teamSize, 0) >= BATTLE_ENGAGEMENT_MIN_SIDE_SIZE
  ))
}

export function buildPublicZvzBattleProjection(input: {
  battle: AlbionBattle
  events: readonly PublicBattleProjectionEvent[]
  coverage: PublicZvzProjectionCoverage
  sourceHash: string
}): PublicZvzBattleProjection {
  const forces = computeBattleForceSummaries(input.battle).filter(
    (force) => force.forceLevel === 'alliance' && force.teamSize > 0,
  )
  const forceByKey = new Map(forces.map((force) => [force.forceKey, force]))
  const engagements = forces.flatMap((home) => (
    splitEventBlocks(directEventsForForce(input.events, home, forceByKey))
      .map((block, index) => projectBlock({
        home,
        block,
        sequence: index + 1,
        coverage: input.coverage,
      }))
  ))

  return {
    sourceHash: input.sourceHash,
    coverage: input.coverage,
    engagements: engagements.sort((a, b) => (
      Date.parse(a.startedAt) - Date.parse(b.startedAt) ||
      a.homeForceKey.localeCompare(b.homeForceKey) ||
      a.sequence - b.sequence
    )),
  }
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100
}

function saturationPoints(
  value: number,
  maximum: number,
  curve = PUBLIC_ZVZ_V2_COMBAT_CURVE,
): number {
  if (value <= 0) return 0
  return maximum * value / (value + curve)
}

function activityPoints(equivalentBattles: number, maximum: number): number {
  if (equivalentBattles <= 0) return 0
  return maximum * Math.min(
    1,
    Math.log1p(equivalentBattles) / Math.log1p(PUBLIC_ZVZ_V2_ACTIVITY_FULL_CREDIT),
  )
}

export function scorePublicZvzEvidence(
  evidence: readonly PublicZvzScoreEvidence[],
  scope: PublicZvzRankingScope,
): PublicZvzScoreBreakdown {
  if (evidence.length === 0) {
    return {
      score: 0,
      representativeSize: 0,
      combatIndex: 0,
      efficiencyIndex: 0,
      equivalentBattles: 0,
      sizePoints: 0,
      combatPoints: 0,
      efficiencyPoints: 0,
      activityPoints: 0,
    }
  }
  const topSizes = evidence
    .map((row) => row.ownTeamSize)
    .sort((a, b) => b - a)
    .slice(0, 3)
  const representativeSize = topSizes.reduce((sum, value) => sum + value, 0) / topSizes.length
  const equivalentBattles = evidence.reduce((sum, row) => sum + row.battleCredit, 0)
  const combatIndex = evidence.reduce((sum, row) => (
    sum + Math.max(
      0,
      row.kills * 3 +
      Math.max(row.kills - row.deaths, 0) * 2 +
      row.killFame / 500_000 -
      Math.max(row.deaths - row.kills, 0) * 0.5,
    )
  ), 0) / evidence.length
  const efficiencyIndex = evidence.reduce((sum, row) => {
    const combatContribution = Math.max(
      0,
      row.kills * 3 +
      Math.max(row.kills - row.deaths, 0) * 2 +
      row.killFame / 500_000 -
      Math.max(row.deaths - row.kills, 0) * 0.5,
    )
    const sideRatio = row.sideTeamSize > 0
      ? row.opponentSideTeamSize / row.sideTeamSize
      : 1
    const difficulty = Math.min(1.25, Math.max(0.75, Math.sqrt(sideRatio)))
    return sum + combatContribution / Math.max(1, row.ownTeamSize) * difficulty
  }, 0) / evidence.length
  const sizePoints = scope === 'overall'
    ? 350 * Math.min(1, representativeSize / 100)
    : 0
  const combatPoints = saturationPoints(combatIndex, scope === 'overall' ? 350 : 700)
  const efficiencyPoints = scope === 'overall'
    ? saturationPoints(efficiencyIndex, 150, PUBLIC_ZVZ_V3_EFFICIENCY_CURVE)
    : 0
  const confidencePoints = activityPoints(equivalentBattles, scope === 'overall' ? 150 : 300)

  return {
    score: rounded(sizePoints + combatPoints + efficiencyPoints + confidencePoints),
    representativeSize: rounded(representativeSize),
    combatIndex: rounded(combatIndex),
    efficiencyIndex: rounded(efficiencyIndex),
    equivalentBattles: rounded(equivalentBattles),
    sizePoints: rounded(sizePoints),
    combatPoints: rounded(combatPoints),
    efficiencyPoints: rounded(efficiencyPoints),
    activityPoints: rounded(confidencePoints),
  }
}

export function normalizePublicZvzRankingEntityKind(
  value: unknown,
): PublicZvzRankingEntityKind {
  return value === 'guild' ? 'guild' : 'alliance'
}

export function selectPublicZvzRankingsPerServer<
  T extends { server: AlbionServer; rank: number },
>(
  rankings: readonly T[],
  server: AlbionServer | null,
  limit: number,
): T[] {
  if (!Number.isSafeInteger(limit) || limit < 1) return []
  const servers = server ? [server] : PUBLIC_ZVZ_RANKING_SERVERS

  return servers.flatMap((rankingServer) => (
    rankings
      .filter((ranking) => ranking.server === rankingServer)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, limit)
  ))
}

export function normalizePublicZvzRankingScope(value: unknown): PublicZvzRankingScope {
  return typeof value === 'string' && PUBLIC_ZVZ_RANKING_SCOPES.includes(
    value as PublicZvzRankingScope,
  )
    ? value as PublicZvzRankingScope
    : 'overall'
}
