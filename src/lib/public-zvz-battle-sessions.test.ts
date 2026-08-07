import { describe, expect, it } from 'vitest'
import type { PublicBattleForce, PublicRecentBattle } from './public-zvz-battles'
import {
  groupPublicZvzBattleSessions,
  PUBLIC_ZVZ_BATTLE_SESSION_GAP_MS,
} from './public-zvz-battle-sessions'

function force(
  forceKey: string,
  teamSize: number,
  kills: number,
  deaths: number,
): PublicBattleForce {
  return {
    forceKey,
    forceKind: 'alliance',
    forceName: forceKey,
    allianceId: forceKey,
    allianceName: forceKey,
    guildIds: [`${forceKey}-guild`],
    guildNames: [`${forceKey} Guild`],
    teamSize,
    kills,
    deaths,
    killFame: kills * 1_000_000,
    averageItemPower: 1_500,
    guildLink: null,
  }
}

function battle(overrides: Partial<PublicRecentBattle> = {}): PublicRecentBattle {
  return {
    id: 'record-1',
    server: 'west',
    albionBattleId: 1001,
    startedAt: '2026-08-06T12:00:00.000Z',
    endedAt: '2026-08-06T12:10:00.000Z',
    totalPlayers: 100,
    totalKills: 15,
    totalFame: 15_000_000,
    clusterName: null,
    activityKind: 'zvz',
    activityReason: 'official',
    isOfficialZvz: true,
    topForces: [force('AAA', 55, 10, 5), force('BBB', 45, 5, 10)],
    topGuilds: [],
    ...overrides,
  }
}

describe('groupPublicZvzBattleSessions', () => {
  it('groups nearby logs only when both sides continue the same fight', () => {
    const sessions = groupPublicZvzBattleSessions([
      battle(),
      battle({
        id: 'record-2',
        albionBattleId: 1002,
        startedAt: '2026-08-06T12:20:00.000Z',
        endedAt: '2026-08-06T12:32:00.000Z',
        totalPlayers: 120,
        totalKills: 20,
        topForces: [force('AAA', 60, 12, 8), force('BBB', 60, 8, 12)],
      }),
    ])

    expect(sessions).toHaveLength(1)
    expect(sessions[0]).toMatchObject({
      battleCount: 2,
      battleIds: [1001, 1002],
      peakPlayers: 120,
      totalKills: 35,
      durationMinutes: 32,
    })
    expect(sessions[0].topForces.map((row) => [row.forceKey, row.kills, row.deaths])).toEqual([
      ['AAA', 22, 13],
      ['BBB', 13, 22],
    ])
  })

  it('does not join a new opponent when only one force overlaps', () => {
    const sessions = groupPublicZvzBattleSessions([
      battle(),
      battle({
        id: 'record-2',
        albionBattleId: 1002,
        startedAt: '2026-08-06T12:15:00.000Z',
        endedAt: '2026-08-06T12:25:00.000Z',
        topForces: [force('AAA', 50, 9, 6), force('CCC', 50, 6, 9)],
      }),
    ])

    expect(sessions).toHaveLength(2)
  })

  it('keeps grouping a fight when an unrelated world battle is interleaved', () => {
    const sessions = groupPublicZvzBattleSessions([
      battle(),
      battle({
        id: 'unrelated',
        albionBattleId: 2001,
        startedAt: '2026-08-06T12:12:00.000Z',
        endedAt: '2026-08-06T12:18:00.000Z',
        topForces: [force('CCC', 30, 4, 3), force('DDD', 30, 3, 4)],
      }),
      battle({
        id: 'record-2',
        albionBattleId: 1002,
        startedAt: '2026-08-06T12:20:00.000Z',
        endedAt: '2026-08-06T12:30:00.000Z',
      }),
    ])

    expect(sessions).toHaveLength(2)
    expect(sessions.find((session) => session.battleIds.includes(1001))?.battleIds).toEqual([
      1001,
      1002,
    ])
  })

  it('groups overlapping source windows from the same fight', () => {
    const sessions = groupPublicZvzBattleSessions([
      battle(),
      battle({
        id: 'record-2',
        albionBattleId: 1002,
        startedAt: '2026-08-06T12:08:00.000Z',
        endedAt: '2026-08-06T12:18:00.000Z',
      }),
    ])

    expect(sessions).toHaveLength(1)
    expect(sessions[0].battleCount).toBe(2)
  })

  it('starts a new session after the quiet gap', () => {
    const sessions = groupPublicZvzBattleSessions([
      battle(),
      battle({
        id: 'record-2',
        albionBattleId: 1002,
        startedAt: new Date(
          Date.parse('2026-08-06T12:10:00.000Z') +
            PUBLIC_ZVZ_BATTLE_SESSION_GAP_MS +
            1,
        ).toISOString(),
        endedAt: '2026-08-06T12:50:00.000Z',
      }),
    ])

    expect(sessions).toHaveLength(2)
  })

  it('does not mix official and unqualified logs', () => {
    const sessions = groupPublicZvzBattleSessions([
      battle(),
      battle({
        id: 'record-2',
        albionBattleId: 1002,
        startedAt: '2026-08-06T12:15:00.000Z',
        endedAt: '2026-08-06T12:25:00.000Z',
        isOfficialZvz: false,
      }),
    ])

    expect(sessions).toHaveLength(2)
  })
})
