import type { PublicZvzOpponentForce } from '@/lib/public-zvz-records'
import type { PublicZvzEngagementScale } from '@/lib/public-zvz-ranking-v2'

export type PublicZvzInsightResult = 'advantage' | 'disadvantage' | 'even'

export interface PublicZvzInsightEvidence {
  battleRecordId: string
  engagementId?: string
  startedAt: string
  teamSize: number
  kills: number
  deaths: number
  killFame: number
  engagementScale?: PublicZvzEngagementScale
  engagementResult?: PublicZvzInsightResult
  opponents: PublicZvzOpponentForce[]
}

export interface PublicZvzRivalInsight {
  key: string
  albionId: string | null
  name: string
  forceKind: 'alliance' | 'guild'
  encounters: number
  kills: number
  deaths: number
  lastFoughtAt: string
}

export interface PublicZvzScaleInsight {
  scale: PublicZvzEngagementScale
  engagements: number
  kills: number
  deaths: number
  averageSize: number
}

export interface PublicZvzFormPoint {
  key: string
  startedAt: string
  result: PublicZvzInsightResult
  kills: number
  deaths: number
}

export interface PublicZvzActivityPoint {
  date: string
  engagements: number
  kills: number
  deaths: number
}

export interface PublicZvzRecordInsights {
  recentForm: PublicZvzFormPoint[]
  formWins: number
  formLosses: number
  formEven: number
  rivals: PublicZvzRivalInsight[]
  scaleStats: PublicZvzScaleInsight[]
  activity: PublicZvzActivityPoint[]
  topRankedOpponentEngagements: number
}

const SCALE_ORDER: PublicZvzEngagementScale[] = ['small', 'mid', 'large', 'zerg']

function resultForEvidence(evidence: PublicZvzInsightEvidence): PublicZvzInsightResult {
  if (evidence.engagementResult) return evidence.engagementResult
  if (evidence.kills > evidence.deaths) return 'advantage'
  if (evidence.kills < evidence.deaths) return 'disadvantage'
  return 'even'
}

function opponentAlbionId(opponent: PublicZvzOpponentForce): string | null {
  return opponent.forceKind === 'alliance'
    ? opponent.allianceAlbionId
    : opponent.guildAlbionId
}

function opponentKey(opponent: PublicZvzOpponentForce): string {
  return opponentAlbionId(opponent) ?? opponent.forceKey
}

function evidenceKey(evidence: PublicZvzInsightEvidence): string {
  return evidence.engagementId ?? evidence.battleRecordId
}

function recentActivityDays(
  activity: ReadonlyMap<string, PublicZvzActivityPoint>,
  latestStartedAt: string | undefined,
): PublicZvzActivityPoint[] {
  if (!latestStartedAt) return []
  const latestDate = new Date(`${latestStartedAt.slice(0, 10)}T00:00:00.000Z`)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(latestDate)
    date.setUTCDate(latestDate.getUTCDate() - (6 - index))
    const key = date.toISOString().slice(0, 10)
    return activity.get(key) ?? { date: key, engagements: 0, kills: 0, deaths: 0 }
  })
}

export function buildPublicZvzRecordInsights(
  evidence: ReadonlyArray<PublicZvzInsightEvidence>,
  options: { topRankedEntityIds?: ReadonlySet<string>; formLimit?: number } = {},
): PublicZvzRecordInsights {
  const sorted = [...evidence].sort(
    (left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt),
  )
  const recentForm = sorted.slice(0, options.formLimit ?? 5).map((row) => ({
    key: evidenceKey(row),
    startedAt: row.startedAt,
    result: resultForEvidence(row),
    kills: row.kills,
    deaths: row.deaths,
  }))
  const rivals = new Map<string, PublicZvzRivalInsight>()
  const scales = new Map<
    PublicZvzEngagementScale,
    PublicZvzScaleInsight & { totalSize: number }
  >()
  const activity = new Map<string, PublicZvzActivityPoint>()
  let topRankedOpponentEngagements = 0

  for (const row of sorted) {
    const eligibleOpponents = row.opponents.filter((opponent) => opponent.hasScoreEvidence)
    if (
      options.topRankedEntityIds &&
      eligibleOpponents.some((opponent) => {
        const id = opponentAlbionId(opponent)
        return id ? options.topRankedEntityIds?.has(id) : false
      })
    ) {
      topRankedOpponentEngagements += 1
    }

    for (const opponent of eligibleOpponents) {
      const key = opponentKey(opponent)
      const current = rivals.get(key)
      if (current) {
        current.encounters += 1
        current.kills += row.kills
        current.deaths += row.deaths
        if (Date.parse(row.startedAt) > Date.parse(current.lastFoughtAt)) {
          current.lastFoughtAt = row.startedAt
        }
      } else {
        rivals.set(key, {
          key,
          albionId: opponentAlbionId(opponent),
          name: opponent.forceName,
          forceKind: opponent.forceKind,
          encounters: 1,
          kills: row.kills,
          deaths: row.deaths,
          lastFoughtAt: row.startedAt,
        })
      }
    }

    if (row.engagementScale) {
      const current = scales.get(row.engagementScale) ?? {
        scale: row.engagementScale,
        engagements: 0,
        kills: 0,
        deaths: 0,
        averageSize: 0,
        totalSize: 0,
      }
      current.engagements += 1
      current.kills += row.kills
      current.deaths += row.deaths
      current.totalSize += row.teamSize
      scales.set(row.engagementScale, current)
    }

    const date = row.startedAt.slice(0, 10)
    const day = activity.get(date) ?? { date, engagements: 0, kills: 0, deaths: 0 }
    day.engagements += 1
    day.kills += row.kills
    day.deaths += row.deaths
    activity.set(date, day)
  }

  return {
    recentForm,
    formWins: recentForm.filter((row) => row.result === 'advantage').length,
    formLosses: recentForm.filter((row) => row.result === 'disadvantage').length,
    formEven: recentForm.filter((row) => row.result === 'even').length,
    rivals: [...rivals.values()].sort(
      (left, right) =>
        right.encounters - left.encounters ||
        Date.parse(right.lastFoughtAt) - Date.parse(left.lastFoughtAt) ||
        left.name.localeCompare(right.name),
    ),
    scaleStats: SCALE_ORDER.flatMap((scale) => {
      const row = scales.get(scale)
      return row
        ? [
            {
              scale,
              engagements: row.engagements,
              kills: row.kills,
              deaths: row.deaths,
              averageSize: row.totalSize / row.engagements,
            },
          ]
        : []
    }),
    activity: recentActivityDays(activity, sorted[0]?.startedAt),
    topRankedOpponentEngagements,
  }
}

export function buildPublicZvzHeadToHead(
  evidence: ReadonlyArray<PublicZvzInsightEvidence>,
  opponentEntityId: string,
): {
  encounters: number
  kills: number
  deaths: number
  wins: number
  losses: number
  even: number
} {
  const matching = evidence.filter((row) =>
    row.opponents.some(
      (opponent) =>
        opponent.hasScoreEvidence && opponentAlbionId(opponent) === opponentEntityId,
    ),
  )
  return {
    encounters: matching.length,
    kills: matching.reduce((sum, row) => sum + row.kills, 0),
    deaths: matching.reduce((sum, row) => sum + row.deaths, 0),
    wins: matching.filter((row) => resultForEvidence(row) === 'advantage').length,
    losses: matching.filter((row) => resultForEvidence(row) === 'disadvantage').length,
    even: matching.filter((row) => resultForEvidence(row) === 'even').length,
  }
}
