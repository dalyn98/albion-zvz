import type { AlbionServer } from '@/lib/albion-gameinfo'
import type {
  PublicZvzEngagementScale,
  PublicZvzRankingEntityKind,
} from '@/lib/public-zvz-ranking-v2'

export const PUBLIC_ZVZ_TOP_FRONT_RANK_LIMIT = 3
export const PUBLIC_ZVZ_TOP_FRONT_RESULT_LIMIT = 3
export const PUBLIC_ZVZ_TOP_FRONT_WINDOW_HOURS = 72
export const PUBLIC_ZVZ_TOP_FRONT_SESSION_GAP_MS = 30 * 60 * 1000

export interface PublicZvzTopFrontRanking {
  entityAlbionId: string
  entityName: string
  entityKind: PublicZvzRankingEntityKind
  rank: number
  sampleStatus: 'ranked' | 'insufficient_sample'
}

export interface PublicZvzTopFrontOpponent {
  forceKey: string
  forceKind: 'alliance' | 'guild'
  albionId: string
  name: string
  teamSize: number
  role: 'result_eligible' | 'intervention'
  kills: number
  deaths: number
}

export interface PublicZvzTopFrontEvidence {
  engagementId: string
  battleRecordId: string
  startedAt: string
  endedAt: string
  scale: PublicZvzEngagementScale
  entityKind: PublicZvzRankingEntityKind
  entityAlbionId: string
  entityName: string
  ownTeamSize: number
  sideTeamSize: number
  opponentSideTeamSize: number
  kills: number
  deaths: number
  opponents: PublicZvzTopFrontOpponent[]
}

export interface PublicZvzTopFrontRankedEntity {
  entityAlbionId: string
  entityName: string
  rank: number
}

export interface PublicZvzTopFrontItem {
  id: string
  server: AlbionServer
  entityKind: PublicZvzRankingEntityKind
  entityAlbionId: string
  entityName: string
  rank: number
  engagementId: string
  battleRecordIds: string[]
  battleIds: number[]
  startedAt: string
  endedAt: string
  scale: 'large' | 'zerg'
  ownTeamSize: number
  sideTeamSize: number
  opponentSideTeamSize: number
  kills: number
  deaths: number
  mainOpponent: PublicZvzTopFrontOpponent
  additionalOpponentCount: number
  rankedEntities: PublicZvzTopFrontRankedEntity[]
}

interface Candidate extends Omit<PublicZvzTopFrontItem, 'id' | 'battleIds'> {
  id: string
  battleIds: number[]
  opponents: PublicZvzTopFrontOpponent[]
}

function parsedTime(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function scaleWeight(scale: PublicZvzEngagementScale): number {
  return scale === 'zerg' ? 2 : scale === 'large' ? 1 : 0
}

function mergeRankedEntities(
  left: readonly PublicZvzTopFrontRankedEntity[],
  right: readonly PublicZvzTopFrontRankedEntity[],
): PublicZvzTopFrontRankedEntity[] {
  const entities = new Map<string, PublicZvzTopFrontRankedEntity>()
  for (const entity of [...left, ...right]) {
    const current = entities.get(entity.entityAlbionId)
    if (!current || entity.rank < current.rank) entities.set(entity.entityAlbionId, entity)
  }
  return [...entities.values()].sort((a, b) => a.rank - b.rank)
}

function mergeOpponents(
  left: readonly PublicZvzTopFrontOpponent[],
  right: readonly PublicZvzTopFrontOpponent[],
): PublicZvzTopFrontOpponent[] {
  const opponents = new Map<string, PublicZvzTopFrontOpponent>()
  for (const opponent of [...left, ...right]) {
    const current = opponents.get(opponent.forceKey)
    if (!current) {
      opponents.set(opponent.forceKey, { ...opponent })
      continue
    }
    current.teamSize = Math.max(current.teamSize, opponent.teamSize)
    current.kills += opponent.kills
    current.deaths += opponent.deaths
  }
  return [...opponents.values()].sort(
    (a, b) => b.teamSize - a.teamSize || b.kills - a.kills || a.name.localeCompare(b.name),
  )
}

function toCandidate(input: {
  server: AlbionServer
  ranking: PublicZvzTopFrontRanking
  evidence: PublicZvzTopFrontEvidence
  rankingsById: ReadonlyMap<string, PublicZvzTopFrontRanking>
}): Candidate | null {
  const { evidence, ranking } = input
  const startedAt = parsedTime(evidence.startedAt)
  const endedAt = parsedTime(evidence.endedAt)
  if (startedAt === null || endedAt === null) return null
  if (evidence.scale !== 'large' && evidence.scale !== 'zerg') return null
  if (evidence.ownTeamSize < 20) return null

  const opponents = evidence.opponents
    .filter((opponent) => opponent.role === 'result_eligible' && opponent.teamSize > 0)
    .sort((a, b) => b.teamSize - a.teamSize || b.kills - a.kills || a.name.localeCompare(b.name))
  const mainOpponent = opponents[0]
  if (!mainOpponent) return null

  const rankedEntities = mergeRankedEntities(
    [
      {
        entityAlbionId: ranking.entityAlbionId,
        entityName: ranking.entityName,
        rank: ranking.rank,
      },
    ],
    opponents.flatMap((opponent) => {
      const opponentRanking = input.rankingsById.get(opponent.albionId)
      return opponentRanking
        ? [
            {
              entityAlbionId: opponentRanking.entityAlbionId,
              entityName: opponentRanking.entityName,
              rank: opponentRanking.rank,
            },
          ]
        : []
    }),
  )

  return {
    id: evidence.battleRecordId,
    server: input.server,
    entityKind: evidence.entityKind,
    entityAlbionId: ranking.entityAlbionId,
    entityName: ranking.entityName,
    rank: ranking.rank,
    engagementId: evidence.engagementId,
    battleRecordIds: [evidence.battleRecordId],
    battleIds: [],
    startedAt: evidence.startedAt,
    endedAt: evidence.endedAt,
    scale: evidence.scale,
    ownTeamSize: evidence.ownTeamSize,
    sideTeamSize: evidence.sideTeamSize,
    opponentSideTeamSize: evidence.opponentSideTeamSize,
    kills: evidence.kills,
    deaths: evidence.deaths,
    mainOpponent,
    additionalOpponentCount: Math.max(0, opponents.length - 1),
    rankedEntities,
    opponents,
  }
}

function mergeCandidate(left: Candidate, right: Candidate): Candidate {
  const opponents = mergeOpponents(left.opponents, right.opponents)
  return {
    ...left,
    id: `${left.id}:${right.id}`,
    battleRecordIds: [...new Set([...left.battleRecordIds, ...right.battleRecordIds])],
    startedAt:
      (parsedTime(left.startedAt) ?? 0) <= (parsedTime(right.startedAt) ?? 0)
        ? left.startedAt
        : right.startedAt,
    endedAt:
      (parsedTime(left.endedAt) ?? 0) >= (parsedTime(right.endedAt) ?? 0)
        ? left.endedAt
        : right.endedAt,
    scale: scaleWeight(right.scale) > scaleWeight(left.scale) ? right.scale : left.scale,
    ownTeamSize: Math.max(left.ownTeamSize, right.ownTeamSize),
    sideTeamSize: Math.max(left.sideTeamSize, right.sideTeamSize),
    opponentSideTeamSize: Math.max(left.opponentSideTeamSize, right.opponentSideTeamSize),
    kills: left.kills + right.kills,
    deaths: left.deaths + right.deaths,
    mainOpponent: opponents[0],
    additionalOpponentCount: Math.max(0, opponents.length - 1),
    rankedEntities: mergeRankedEntities(left.rankedEntities, right.rankedEntities),
    opponents,
  }
}

function isSameSession(left: Candidate, right: Candidate): boolean {
  if (left.server !== right.server) return false
  if (left.entityKind !== right.entityKind) return false
  if (left.entityAlbionId !== right.entityAlbionId) return false
  if (left.mainOpponent.forceKey !== right.mainOpponent.forceKey) return false
  const leftEndedAt = parsedTime(left.endedAt)
  const rightStartedAt = parsedTime(right.startedAt)
  if (leftEndedAt === null || rightStartedAt === null) return false
  return Math.max(0, rightStartedAt - leftEndedAt) <= PUBLIC_ZVZ_TOP_FRONT_SESSION_GAP_MS
}

export function selectPublicZvzTopFront(input: {
  server: AlbionServer
  rankings: readonly PublicZvzTopFrontRanking[]
  evidence: readonly PublicZvzTopFrontEvidence[]
  windowEndsAt: string
  windowHours?: number
  limit?: number
}): PublicZvzTopFrontItem[] {
  const windowEndsAt = parsedTime(input.windowEndsAt)
  if (windowEndsAt === null) return []
  const windowStartsAt =
    windowEndsAt - (input.windowHours ?? PUBLIC_ZVZ_TOP_FRONT_WINDOW_HOURS) * 60 * 60 * 1000
  const topRankings = input.rankings
    .filter(
      (ranking) =>
        ranking.rank >= 1 &&
        ranking.rank <= PUBLIC_ZVZ_TOP_FRONT_RANK_LIMIT &&
        ranking.sampleStatus === 'ranked',
    )
    .sort((a, b) => a.rank - b.rank)
  const rankingsById = new Map(topRankings.map((ranking) => [ranking.entityAlbionId, ranking]))

  const candidates = input.evidence.flatMap((evidence): Candidate[] => {
    const ranking = rankingsById.get(evidence.entityAlbionId)
    const startedAt = parsedTime(evidence.startedAt)
    if (!ranking || startedAt === null || startedAt < windowStartsAt || startedAt > windowEndsAt) {
      return []
    }
    const candidate = toCandidate({
      server: input.server,
      ranking,
      evidence,
      rankingsById,
    })
    return candidate ? [candidate] : []
  })

  const byBattle = new Map<string, Candidate>()
  for (const candidate of candidates) {
    const battleRecordId = candidate.battleRecordIds[0]
    const current = byBattle.get(battleRecordId)
    if (!current || candidate.rank < current.rank) {
      byBattle.set(
        battleRecordId,
        current
          ? {
              ...candidate,
              rankedEntities: mergeRankedEntities(current.rankedEntities, candidate.rankedEntities),
            }
          : candidate,
      )
    } else {
      current.rankedEntities = mergeRankedEntities(current.rankedEntities, candidate.rankedEntities)
    }
  }

  const sessions: Candidate[] = []
  const chronological = [...byBattle.values()].sort(
    (a, b) => (parsedTime(a.startedAt) ?? 0) - (parsedTime(b.startedAt) ?? 0),
  )
  for (const candidate of chronological) {
    const previousIndex = sessions.findLastIndex((session) => isSameSession(session, candidate))
    if (previousIndex >= 0) {
      sessions[previousIndex] = mergeCandidate(sessions[previousIndex], candidate)
    } else {
      sessions.push(candidate)
    }
  }

  return sessions
    .sort(
      (a, b) => (parsedTime(b.startedAt) ?? 0) - (parsedTime(a.startedAt) ?? 0) || a.rank - b.rank,
    )
    .slice(0, input.limit ?? PUBLIC_ZVZ_TOP_FRONT_RESULT_LIMIT)
    .map((candidate): PublicZvzTopFrontItem => ({
      id: candidate.id,
      server: candidate.server,
      entityKind: candidate.entityKind,
      entityAlbionId: candidate.entityAlbionId,
      entityName: candidate.entityName,
      rank: candidate.rank,
      engagementId: candidate.engagementId,
      battleRecordIds: candidate.battleRecordIds,
      battleIds: candidate.battleIds,
      startedAt: candidate.startedAt,
      endedAt: candidate.endedAt,
      scale: candidate.scale,
      ownTeamSize: candidate.ownTeamSize,
      sideTeamSize: candidate.sideTeamSize,
      opponentSideTeamSize: candidate.opponentSideTeamSize,
      kills: candidate.kills,
      deaths: candidate.deaths,
      mainOpponent: candidate.mainOpponent,
      additionalOpponentCount: candidate.additionalOpponentCount,
      rankedEntities: candidate.rankedEntities,
    }))
}
