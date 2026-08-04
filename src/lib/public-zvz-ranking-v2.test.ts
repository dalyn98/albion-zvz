import { describe, expect, it } from 'vitest'
import type { AlbionBattle, AlbionBattlePlayer } from './albion-battles'
import type {
  PublicBattleAnalysisActor,
  PublicBattleProjectionEvent,
} from './public-battle-analysis-model'
import {
  buildPublicZvzBattleProjection,
  isPublicZvzProjectionCandidate,
  scorePublicZvzEvidence,
  selectPublicZvzPrimaryEngagementScale,
} from './public-zvz-ranking-v2'

function player(input: {
  id: string
  guildId: string
  guildName: string
  allianceId?: string | null
  allianceName?: string | null
}): AlbionBattlePlayer {
  return {
    id: input.id,
    name: input.id,
    guildId: input.guildId,
    guildName: input.guildName,
    allianceId: input.allianceId ?? null,
    allianceName: input.allianceName ?? null,
    kills: 0,
    deaths: 0,
    killFame: 0,
  }
}

function actor(value: AlbionBattlePlayer): PublicBattleAnalysisActor {
  const guildKey = `g:${value.guildId}`
  const allianceKey = value.allianceId ? `a:${value.allianceId}` : guildKey
  return {
    playerId: value.id,
    playerName: value.name,
    guildId: value.guildId,
    guildName: value.guildName,
    allianceId: value.allianceId,
    allianceName: value.allianceName,
    forceKey: allianceKey,
    forceName: value.allianceName ?? value.guildName,
    allianceKey,
    guildKey,
    itemPower: null,
    weaponId: null,
    equipment: null,
  }
}

function battleFixture(): AlbionBattle {
  const players: Record<string, AlbionBattlePlayer> = {}
  for (let index = 1; index <= 12; index += 1) {
    const value = player({
      id: `alpha-${index}`,
      guildId: 'alpha',
      guildName: 'Alpha',
      allianceId: 'home-alliance',
      allianceName: 'HOME',
    })
    players[value.id] = value
  }
  for (let index = 1; index <= 8; index += 1) {
    const value = player({
      id: `beta-${index}`,
      guildId: 'beta',
      guildName: 'Beta',
      allianceId: 'home-alliance',
      allianceName: 'HOME',
    })
    players[value.id] = value
  }
  for (let index = 1; index <= 12; index += 1) {
    const value = player({ id: `red-${index}`, guildId: 'red', guildName: 'Red' })
    players[value.id] = value
  }
  for (let index = 1; index <= 8; index += 1) {
    const value = player({ id: `blue-${index}`, guildId: 'blue', guildName: 'Blue' })
    players[value.id] = value
  }

  return {
    id: 9001,
    startTime: '2026-08-03T13:00:00.000Z',
    endTime: '2026-08-03T13:30:00.000Z',
    totalFame: 5_000_000,
    totalKills: 10,
    clusterName: null,
    players,
    guilds: {
      alpha: {
        id: 'alpha',
        name: 'Alpha',
        alliance: 'HOME',
        allianceId: 'home-alliance',
        kills: 3,
        deaths: 2,
        killFame: 1_500_000,
      },
      beta: {
        id: 'beta',
        name: 'Beta',
        alliance: 'HOME',
        allianceId: 'home-alliance',
        kills: 2,
        deaths: 3,
        killFame: 1_000_000,
      },
      red: {
        id: 'red',
        name: 'Red',
        alliance: '',
        allianceId: '',
        kills: 3,
        deaths: 2,
        killFame: 1_500_000,
      },
      blue: {
        id: 'blue',
        name: 'Blue',
        alliance: '',
        allianceId: '',
        kills: 2,
        deaths: 3,
        killFame: 1_000_000,
      },
    },
    alliances: {
      'home-alliance': {
        id: 'home-alliance',
        name: 'HOME',
        kills: 5,
        deaths: 5,
        killFame: 2_500_000,
      },
    },
  }
}

function event(input: {
  battle: AlbionBattle
  id: number
  minute: number
  homeRole: 'killer' | 'victim'
  opponentGuild: 'red' | 'blue'
  observedPlayers?: AlbionBattlePlayer[]
}): PublicBattleProjectionEvent {
  const home = actor(input.battle.players['alpha-1'])
  const opponent = actor(input.battle.players[`${input.opponentGuild}-1`])
  return {
    eventId: String(input.id),
    battleId: input.battle.id,
    occurredAt: `2026-08-03T13:${String(input.minute).padStart(2, '0')}:00.000Z`,
    fame: 500_000,
    killer: input.homeRole === 'killer' ? home : opponent,
    victim: input.homeRole === 'victim' ? home : opponent,
    participants: [],
    observations: (input.observedPlayers ?? Object.values(input.battle.players)).map(actor),
  }
}

function fiveEventFight(
  battle: AlbionBattle,
  startMinute = 0,
  allHomeDeaths = false,
  observedPlayers?: AlbionBattlePlayer[],
): PublicBattleProjectionEvent[] {
  return [
    event({ battle, id: startMinute + 1, minute: startMinute, homeRole: allHomeDeaths ? 'victim' : 'killer', opponentGuild: 'red', observedPlayers }),
    event({ battle, id: startMinute + 2, minute: startMinute + 1, homeRole: 'victim', opponentGuild: 'red', observedPlayers }),
    event({ battle, id: startMinute + 3, minute: startMinute + 2, homeRole: allHomeDeaths ? 'victim' : 'killer', opponentGuild: 'red', observedPlayers }),
    event({ battle, id: startMinute + 4, minute: startMinute + 3, homeRole: allHomeDeaths ? 'victim' : 'killer', opponentGuild: 'blue', observedPlayers }),
    event({ battle, id: startMinute + 5, minute: startMinute + 4, homeRole: 'victim', opponentGuild: 'blue', observedPlayers }),
  ]
}

describe('public ZvZ v2 engagement projection', () => {
  it('qualifies a 20 vs 12+8 fight and distributes alliance credit by observed guild size', () => {
    const battle = battleFixture()
    expect(isPublicZvzProjectionCandidate(battle)).toBe(true)
    const projection = buildPublicZvzBattleProjection({
      battle,
      events: fiveEventFight(battle),
      coverage: 'complete',
      sourceHash: 'source-1',
    })
    const home = projection.engagements.find(
      (engagement) => engagement.homeForceKey === 'a:home-alliance',
    )

    expect(home).toMatchObject({
      status: 'final',
      homeSideTeamSize: 20,
      opponentSideTeamSize: 20,
      scale: 'small',
      resultEventCount: 5,
      interventionEventCount: 0,
    })
    const alliance = home?.evidence.find((row) => row.entityKind === 'alliance')
    const alpha = home?.evidence.find((row) => row.entityAlbionId === 'alpha')
    const beta = home?.evidence.find((row) => row.entityAlbionId === 'beta')
    expect(alliance).toMatchObject({ ownTeamSize: 20, battleCredit: 1, battlePoints: 25 })
    expect(alpha).toMatchObject({ ownTeamSize: 12, participationShare: 0.6, battlePoints: 15 })
    expect(beta).toMatchObject({ ownTeamSize: 8, participationShare: 0.4, battlePoints: 10 })
  })

  it('accepts a one-sided death sequence as direct engagement evidence', () => {
    const battle = battleFixture()
    const projection = buildPublicZvzBattleProjection({
      battle,
      events: fiveEventFight(battle, 0, true),
      coverage: 'complete',
      sourceHash: 'source-2',
    })
    const home = projection.engagements.find(
      (engagement) => engagement.homeForceKey === 'a:home-alliance',
    )
    expect(home).toMatchObject({
      status: 'final',
      result: 'disadvantage',
      homeKills: 0,
      homeDeaths: 5,
    })
  })

  it('uses only players observed in the engagement instead of reusing the raw battle size', () => {
    const battle = battleFixture()
    const observedPlayers = Object.values(battle.players)
    for (let index = 1; index <= 20; index += 1) {
      const homeExtra = player({
        id: `home-extra-${index}`,
        guildId: 'alpha',
        guildName: 'Alpha',
        allianceId: 'home-alliance',
        allianceName: 'HOME',
      })
      const opponentExtra = player({
        id: `red-extra-${index}`,
        guildId: 'red',
        guildName: 'Red',
      })
      battle.players[homeExtra.id] = homeExtra
      battle.players[opponentExtra.id] = opponentExtra
    }

    const home = buildPublicZvzBattleProjection({
      battle,
      events: fiveEventFight(battle, 0, false, observedPlayers),
      coverage: 'complete',
      sourceHash: 'source-observed-size',
    }).engagements.find((engagement) => engagement.homeForceKey === 'a:home-alliance')

    expect(home).toMatchObject({
      status: 'final',
      homeSideTeamSize: 20,
      opponentSideTeamSize: 20,
      scale: 'small',
    })
    expect(home?.evidence.find((row) => row.entityAlbionId === 'alpha')).toMatchObject({
      ownTeamSize: 12,
      participationShare: 0.6,
    })
  })

  it('splits clear time gaps and refuses ambiguous boundaries', () => {
    const battle = battleFixture()
    const clear = buildPublicZvzBattleProjection({
      battle,
      events: [...fiveEventFight(battle, 0), ...fiveEventFight(battle, 13)],
      coverage: 'complete',
      sourceHash: 'source-3',
    }).engagements.filter((row) => row.homeForceKey === 'a:home-alliance')
    expect(clear).toHaveLength(2)
    expect(clear.every((row) => row.status === 'final')).toBe(true)

    const ambiguousEvents = [
      event({ battle, id: 1, minute: 0, homeRole: 'killer', opponentGuild: 'red' }),
      event({ battle, id: 2, minute: 4, homeRole: 'victim', opponentGuild: 'red' }),
      event({ battle, id: 3, minute: 5, homeRole: 'killer', opponentGuild: 'red' }),
      event({ battle, id: 4, minute: 6, homeRole: 'killer', opponentGuild: 'blue' }),
      event({ battle, id: 5, minute: 7, homeRole: 'victim', opponentGuild: 'blue' }),
    ]
    const ambiguous = buildPublicZvzBattleProjection({
      battle,
      events: ambiguousEvents,
      coverage: 'complete',
      sourceHash: 'source-4',
    }).engagements.filter((row) => row.homeForceKey === 'a:home-alliance')
    expect(ambiguous.some((row) => row.status === 'segmentation_required')).toBe(true)
    expect(ambiguous.flatMap((row) => row.evidence)).toEqual([])
  })

  it('never scores partial event coverage', () => {
    const battle = battleFixture()
    const home = buildPublicZvzBattleProjection({
      battle,
      events: fiveEventFight(battle),
      coverage: 'partial',
      sourceHash: 'source-5',
    }).engagements.find((engagement) => engagement.homeForceKey === 'a:home-alliance')
    expect(home).toMatchObject({ status: 'partial_source', evidence: [] })
  })
})

describe('public ZvZ v2 scoring', () => {
  const evidence = [
    { ownTeamSize: 80, battleCredit: 1, kills: 10, deaths: 5, killFame: 5_000_000 },
    { ownTeamSize: 60, battleCredit: 0.6, kills: 7, deaths: 5, killFame: 3_000_000 },
    { ownTeamSize: 40, battleCredit: 0.4, kills: 5, deaths: 5, killFame: 2_000_000 },
    { ownTeamSize: 20, battleCredit: 0.2, kills: 2, deaths: 3, killFame: 500_000 },
  ]

  it('uses the top-three average and keeps size as the largest overall component', () => {
    const score = scorePublicZvzEvidence(evidence, 'overall')
    expect(score.representativeSize).toBe(60)
    expect(score.sizePoints).toBe(300)
    expect(score.combatPoints).toBeLessThanOrEqual(350)
    expect(score.activityPoints).toBeLessThanOrEqual(150)
    expect(score.score).toBeCloseTo(
      score.sizePoints + score.combatPoints + score.activityPoints,
      2,
    )
  })

  it('recomputes scale rankings without an additional size component', () => {
    const overall = scorePublicZvzEvidence(evidence, 'overall')
    const scoped = scorePublicZvzEvidence(evidence, 'large')
    expect(scoped.sizePoints).toBe(0)
    expect(scoped.combatPoints).toBeGreaterThan(overall.combatPoints)
    expect(scoped.activityPoints).toBeGreaterThan(overall.activityPoints)
    expect(scoped.combatPoints).toBeLessThanOrEqual(700)
    expect(scoped.activityPoints).toBeLessThanOrEqual(300)
  })
})

describe('public ZvZ primary engagement scale', () => {
  it('selects the highest scale with at least two engagements', () => {
    expect(selectPublicZvzPrimaryEngagementScale([
      { scope: 'overall', engagementCount: 9 },
      { scope: 'mid', engagementCount: 6 },
      { scope: 'large', engagementCount: 2 },
      { scope: 'zerg', engagementCount: 1 },
    ])).toBe('large')

    expect(selectPublicZvzPrimaryEngagementScale([
      { scope: 'mid', engagementCount: 10 },
      { scope: 'zerg', engagementCount: 2 },
    ])).toBe('zerg')
  })

  it('keeps one-off higher-scale fights recorded without fixing the primary scale', () => {
    expect(selectPublicZvzPrimaryEngagementScale([
      { scope: 'small', engagementCount: 1 },
      { scope: 'mid', engagementCount: 1 },
      { scope: 'zerg', engagementCount: 1 },
    ])).toBeNull()
  })
})
