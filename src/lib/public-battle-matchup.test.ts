import { describe, expect, it } from 'vitest'
import type { PublicBattleAnalysisActor, PublicBattleAnalysisEvent } from './public-battle-analysis-model'
import { buildPublicBattleMatchupSummary } from './public-battle-matchup'
import type {
  PublicBattleGroupForceLine,
  PublicBattleGroupPlayerLine,
  PublicBattleGroupReport,
} from './public-battle-report-model'

function force(forceKey: string, forceName: string, players: number, battleIds = [101, 102]): PublicBattleGroupForceLine {
  return {
    forceKey,
    forceKind: 'alliance',
    forceName,
    players,
    kills: 0,
    deaths: 0,
    killFame: 0,
    guildNames: [`${forceName} Guild`],
    battleIds,
    highlighted: forceKey === 'a:home',
  }
}

function player(
  playerId: string,
  playerName: string,
  forceKey: string,
  forceName: string,
  battleIds: number[],
): PublicBattleGroupPlayerLine {
  return {
    playerId,
    playerName,
    forceKey,
    forceName,
    guildId: `${forceKey}:guild`,
    guildName: `${forceName} Guild`,
    allianceId: forceKey.slice(2),
    allianceName: forceName,
    kills: 0,
    deaths: 0,
    killFame: 0,
    battleIds,
    battleStats: battleIds.map((battleId) => ({
      battleId,
      forceKey,
      allianceKey: forceKey,
      guildKey: `g:${forceKey}:guild`,
      kills: 0,
      deaths: 0,
      killFame: 0,
    })),
  }
}

function reportFixture(): PublicBattleGroupReport {
  const forces = [
    force('a:home', 'HOME', 2),
    force('a:alpha', 'ALPHA', 1),
    force('a:bravo', 'BRAVO', 1),
    force('a:charlie', 'CHARLIE', 1, [101]),
  ]
  return {
    server: 'east',
    requestedBattleIds: [101, 102],
    unavailableBattleIds: [],
    battles: [
      { albionBattleId: 101, startedAt: '2026-08-02T12:00:00Z', endedAt: '2026-08-02T12:10:00Z', clusterName: null, totalPlayers: 5, totalKills: 5, totalFame: 0, topForceName: 'HOME' },
      { albionBattleId: 102, startedAt: '2026-08-02T12:20:00Z', endedAt: '2026-08-02T12:30:00Z', clusterName: null, totalPlayers: 4, totalKills: 1, totalFame: 0, topForceName: 'HOME' },
    ],
    forces,
    alliances: forces,
    guilds: [],
    players: [
      player('home-1', 'Home One', 'a:home', 'HOME', [101, 102]),
      player('home-2', 'Home Two', 'a:home', 'HOME', [101]),
      player('alpha-1', 'Alpha One', 'a:alpha', 'ALPHA', [101, 102]),
      player('bravo-1', 'Bravo One', 'a:bravo', 'BRAVO', [101, 102]),
      player('charlie-1', 'Charlie One', 'a:charlie', 'CHARLIE', [101]),
    ],
    primaryForce: forces[0],
    primaryForceName: 'HOME',
    highlightedForceKey: 'a:home',
    startedAt: '2026-08-02T12:00:00Z',
    endedAt: '2026-08-02T12:30:00Z',
    battleCount: 2,
    clusterNames: [],
    totalPlayersUnique: 5,
    totalKills: 6,
    totalDeaths: 6,
    totalFame: 0,
    topKills: [],
    topDeaths: [],
    recentEvents: [],
  }
}

function actor(playerId: string, forceKey: string, forceName: string): PublicBattleAnalysisActor {
  return {
    playerId,
    playerName: playerId,
    guildId: `${forceKey}:guild`,
    guildName: `${forceName} Guild`,
    allianceId: forceKey.slice(2),
    allianceName: forceName,
    forceKey,
    forceName,
    allianceKey: forceKey,
    guildKey: `g:${forceKey}:guild`,
    itemPower: null,
    weaponId: null,
    equipment: null,
  }
}

function event(
  eventId: number,
  battleId: number,
  killer: PublicBattleAnalysisActor,
  victim: PublicBattleAnalysisActor,
): PublicBattleAnalysisEvent {
  return {
    eventId: String(eventId),
    battleId,
    occurredAt: `2026-08-02T12:0${eventId}:00Z`,
    fame: 0,
    killer,
    victim,
  }
}

describe('buildPublicBattleMatchupSummary', () => {
  const home = actor('home-1', 'a:home', 'HOME')
  const alpha = actor('alpha-1', 'a:alpha', 'ALPHA')
  const bravo = actor('bravo-1', 'a:bravo', 'BRAVO')
  const charlie = actor('charlie-1', 'a:charlie', 'CHARLIE')
  const events = [
    event(1, 101, home, alpha),
    event(2, 101, home, alpha),
    event(3, 101, home, alpha),
    event(4, 101, bravo, home),
    event(5, 101, charlie, alpha),
    event(6, 102, home, bravo),
  ]

  it('treats one-sided kills as direct opponents and excludes third-party-only edges', () => {
    const summary = buildPublicBattleMatchupSummary({ report: reportFixture(), events, battleId: 101 })

    expect(summary).toMatchObject({
      battleId: 101,
      homeKills: 3,
      homeDeaths: 1,
      directEventCount: 4,
      otherParticipantForces: 1,
      home: { players: 2 },
    })
    expect(summary.opponents).toEqual([
      expect.objectContaining({ forceKey: 'a:alpha', homeKills: 3, homeDeaths: 0, interactions: 3 }),
      expect.objectContaining({ forceKey: 'a:bravo', homeKills: 0, homeDeaths: 1, interactions: 1 }),
    ])
    expect(summary.opponents.some((opponent) => opponent.forceKey === 'a:charlie')).toBe(false)
  })

  it('scopes direct opponents to one battle while preserving an all-battles summary', () => {
    const battleSummary = buildPublicBattleMatchupSummary({ report: reportFixture(), events, battleId: 102 })
    const sessionSummary = buildPublicBattleMatchupSummary({ report: reportFixture(), events })

    expect(battleSummary.home.players).toBe(1)
    expect(battleSummary.opponents).toEqual([
      expect.objectContaining({ forceKey: 'a:bravo', homeKills: 1, homeDeaths: 0 }),
    ])
    expect(sessionSummary).toMatchObject({ homeKills: 4, homeDeaths: 1, directEventCount: 5 })
    expect(sessionSummary.opponents.map((opponent) => opponent.forceKey)).toEqual(['a:alpha', 'a:bravo'])
  })
})
