import { describe, expect, it } from 'vitest'
import {
  PUBLIC_ZVZ_TOP_FRONT_SESSION_GAP_MS,
  selectPublicZvzTopFront,
  type PublicZvzTopFrontEvidence,
  type PublicZvzTopFrontRanking,
} from '@/lib/public-zvz-top-front'

const rankings: PublicZvzTopFrontRanking[] = [
  {
    entityAlbionId: 'alliance-1',
    entityName: 'First',
    entityKind: 'alliance',
    rank: 1,
    sampleStatus: 'ranked',
  },
  {
    entityAlbionId: 'alliance-2',
    entityName: 'Second',
    entityKind: 'alliance',
    rank: 2,
    sampleStatus: 'ranked',
  },
  {
    entityAlbionId: 'alliance-3',
    entityName: 'Third',
    entityKind: 'alliance',
    rank: 3,
    sampleStatus: 'ranked',
  },
  {
    entityAlbionId: 'alliance-4',
    entityName: 'Fourth',
    entityKind: 'alliance',
    rank: 4,
    sampleStatus: 'ranked',
  },
]

function evidence(overrides: Partial<PublicZvzTopFrontEvidence> = {}): PublicZvzTopFrontEvidence {
  return {
    engagementId: 'engagement-1',
    battleRecordId: 'battle-1',
    startedAt: '2026-08-10T10:00:00.000Z',
    endedAt: '2026-08-10T10:10:00.000Z',
    scale: 'large',
    entityKind: 'alliance',
    entityAlbionId: 'alliance-1',
    entityName: 'First',
    ownTeamSize: 45,
    sideTeamSize: 45,
    opponentSideTeamSize: 50,
    kills: 20,
    deaths: 10,
    opponents: [
      {
        forceKey: 'alliance:enemy',
        forceKind: 'alliance',
        albionId: 'enemy',
        name: 'Enemy',
        teamSize: 50,
        role: 'result_eligible',
        kills: 10,
        deaths: 20,
      },
    ],
    ...overrides,
  }
}

describe('selectPublicZvzTopFront', () => {
  it('keeps only recent large fights with meaningful top-three participation', () => {
    const result = selectPublicZvzTopFront({
      server: 'west',
      rankings,
      evidence: [
        evidence(),
        evidence({
          battleRecordId: 'small',
          engagementId: 'small',
          scale: 'mid',
        }),
        evidence({
          battleRecordId: 'tag',
          engagementId: 'tag',
          ownTeamSize: 19,
        }),
        evidence({
          battleRecordId: 'old',
          engagementId: 'old',
          startedAt: '2026-08-06T10:00:00.000Z',
          endedAt: '2026-08-06T10:10:00.000Z',
        }),
        evidence({
          battleRecordId: 'fourth',
          engagementId: 'fourth',
          entityAlbionId: 'alliance-4',
          entityName: 'Fourth',
        }),
        evidence({
          battleRecordId: 'intervention',
          engagementId: 'intervention',
          opponents: [
            {
              forceKey: 'alliance:tag',
              forceKind: 'alliance',
              albionId: 'tag',
              name: 'Tag',
              teamSize: 50,
              role: 'intervention',
              kills: 1,
              deaths: 1,
            },
          ],
        }),
      ],
      windowEndsAt: '2026-08-10T12:00:00.000Z',
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      entityAlbionId: 'alliance-1',
      rank: 1,
      battleRecordIds: ['battle-1'],
      scale: 'large',
      kills: 20,
      deaths: 10,
    })
  })

  it('deduplicates a top-three matchup and keeps every ranked participant', () => {
    const result = selectPublicZvzTopFront({
      server: 'east',
      rankings,
      evidence: [
        evidence({
          opponents: [
            {
              forceKey: 'alliance:alliance-2',
              forceKind: 'alliance',
              albionId: 'alliance-2',
              name: 'Second',
              teamSize: 50,
              role: 'result_eligible',
              kills: 10,
              deaths: 20,
            },
          ],
        }),
        evidence({
          entityAlbionId: 'alliance-2',
          entityName: 'Second',
          kills: 10,
          deaths: 20,
          opponents: [
            {
              forceKey: 'alliance:alliance-1',
              forceKind: 'alliance',
              albionId: 'alliance-1',
              name: 'First',
              teamSize: 45,
              role: 'result_eligible',
              kills: 20,
              deaths: 10,
            },
          ],
        }),
      ],
      windowEndsAt: '2026-08-10T12:00:00.000Z',
    })

    expect(result).toHaveLength(1)
    expect(result[0].entityAlbionId).toBe('alliance-1')
    expect(result[0].rankedEntities).toEqual([
      { entityAlbionId: 'alliance-1', entityName: 'First', rank: 1 },
      { entityAlbionId: 'alliance-2', entityName: 'Second', rank: 2 },
    ])
  })

  it('merges adjacent logs for the same matchup but leaves separate fights apart', () => {
    const secondStartedAt = new Date(
      Date.parse('2026-08-10T10:10:00.000Z') + PUBLIC_ZVZ_TOP_FRONT_SESSION_GAP_MS,
    ).toISOString()
    const result = selectPublicZvzTopFront({
      server: 'europe',
      rankings,
      evidence: [
        evidence(),
        evidence({
          engagementId: 'engagement-2',
          battleRecordId: 'battle-2',
          startedAt: secondStartedAt,
          endedAt: '2026-08-10T10:50:00.000Z',
          scale: 'zerg',
          kills: 7,
          deaths: 4,
        }),
        evidence({
          engagementId: 'engagement-3',
          battleRecordId: 'battle-3',
          startedAt: '2026-08-10T11:30:01.000Z',
          endedAt: '2026-08-10T11:40:00.000Z',
          kills: 3,
          deaths: 2,
        }),
      ],
      windowEndsAt: '2026-08-10T12:00:00.000Z',
    })

    expect(result).toHaveLength(2)
    expect(result[1]).toMatchObject({
      battleRecordIds: ['battle-1', 'battle-2'],
      scale: 'zerg',
      kills: 27,
      deaths: 14,
    })
  })
})
