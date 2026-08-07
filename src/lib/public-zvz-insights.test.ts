import { describe, expect, it } from 'vitest'
import type { PublicZvzOpponentForce } from './public-zvz-records'
import {
  buildPublicZvzHeadToHead,
  buildPublicZvzRecordInsights,
  type PublicZvzInsightEvidence,
} from './public-zvz-insights'

function opponent(id: string, name = id): PublicZvzOpponentForce {
  return {
    forceKey: `alliance:${id}`,
    forceKind: 'alliance',
    forceName: name,
    allianceAlbionId: id,
    guildAlbionId: null,
    teamSize: 40,
    kills: 4,
    deaths: 8,
    killFame: 1_000_000,
    hasScoreEvidence: true,
  }
}

function evidence(
  id: string,
  startedAt: string,
  kills: number,
  deaths: number,
  opponentId: string,
  scale: PublicZvzInsightEvidence['engagementScale'] = 'mid',
): PublicZvzInsightEvidence {
  return {
    battleRecordId: id,
    engagementId: `engagement-${id}`,
    startedAt,
    teamSize: 35,
    kills,
    deaths,
    killFame: kills * 1_000_000,
    engagementScale: scale,
    engagementResult: kills > deaths ? 'advantage' : kills < deaths ? 'disadvantage' : 'even',
    opponents: [opponent(opponentId)],
  }
}

describe('buildPublicZvzRecordInsights', () => {
  it('summarizes recent form, scales, activity and recurring rivals', () => {
    const insights = buildPublicZvzRecordInsights([
      evidence('1', '2026-08-01T12:00:00.000Z', 10, 4, 'AAA'),
      evidence('2', '2026-08-02T12:00:00.000Z', 3, 7, 'BBB', 'large'),
      evidence('3', '2026-08-03T12:00:00.000Z', 8, 6, 'AAA'),
    ], { topRankedEntityIds: new Set(['AAA']) })

    expect(insights).toMatchObject({
      formWins: 2,
      formLosses: 1,
      formEven: 0,
      topRankedOpponentEngagements: 2,
    })
    expect(insights.rivals[0]).toMatchObject({ name: 'AAA', encounters: 2, kills: 18, deaths: 10 })
    expect(insights.scaleStats).toEqual([
      { scale: 'mid', engagements: 2, kills: 18, deaths: 10, averageSize: 35 },
      { scale: 'large', engagements: 1, kills: 3, deaths: 7, averageSize: 35 },
    ])
    expect(insights.activity).toHaveLength(7)
    expect(insights.activity[0]).toEqual({
      date: '2026-07-28',
      engagements: 0,
      kills: 0,
      deaths: 0,
    })
    expect(insights.activity.at(-1)).toEqual({
      date: '2026-08-03',
      engagements: 1,
      kills: 8,
      deaths: 6,
    })
  })
})

describe('buildPublicZvzHeadToHead', () => {
  it('counts only evidence that names the selected opponent', () => {
    const result = buildPublicZvzHeadToHead([
      evidence('1', '2026-08-01T12:00:00.000Z', 10, 4, 'AAA'),
      evidence('2', '2026-08-02T12:00:00.000Z', 3, 7, 'BBB'),
      evidence('3', '2026-08-03T12:00:00.000Z', 5, 5, 'AAA'),
    ], 'AAA')

    expect(result).toEqual({
      encounters: 2,
      kills: 15,
      deaths: 9,
      wins: 1,
      losses: 0,
      even: 1,
    })
  })
})
