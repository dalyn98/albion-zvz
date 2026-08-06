import { describe, expect, it } from 'vitest'
import type { AlbionBattle, AlbionBattlePlayer } from './albion-battles'
import type {
  PublicBattleAnalysisActor,
  PublicBattleProjectionEvent,
} from './public-battle-analysis-model'
import {
  assessPublicZvzEngagementScaleMatch,
  buildPublicZvzBattleProjection,
  isPublicZvzProjectionCandidate,
  normalizePublicZvzRankingEntityKind,
  PUBLIC_ZVZ_RANKING_ENTITY_KINDS,
  scorePublicZvzEvidence,
  selectPublicZvzRankingsPerServer,
  selectPublicZvzPrimaryEngagementScale,
} from './public-zvz-ranking-v2'

describe('public ZvZ ranking entity navigation defaults', () => {
  it('puts alliance rankings first and keeps guild as an explicit selection', () => {
    expect(PUBLIC_ZVZ_RANKING_ENTITY_KINDS).toEqual(['alliance', 'guild'])
    expect(normalizePublicZvzRankingEntityKind(undefined)).toBe('alliance')
    expect(normalizePublicZvzRankingEntityKind('invalid')).toBe('alliance')
    expect(normalizePublicZvzRankingEntityKind('alliance')).toBe('alliance')
    expect(normalizePublicZvzRankingEntityKind('guild')).toBe('guild')
  })
})

describe('public ZvZ server-isolated ranking selection', () => {
  const rankings = [
    { id: 'east-1', server: 'east' as const, rank: 1, score: 999 },
    { id: 'west-2', server: 'west' as const, rank: 2, score: 700 },
    { id: 'europe-1', server: 'europe' as const, rank: 1, score: 600 },
    { id: 'west-1', server: 'west' as const, rank: 1, score: 500 },
    { id: 'east-2', server: 'east' as const, rank: 2, score: 400 },
    { id: 'europe-2', server: 'europe' as const, rank: 2, score: 300 },
  ]

  it('keeps a separate limit and rank order for every server', () => {
    expect(selectPublicZvzRankingsPerServer(rankings, null, 1).map((row) => row.id)).toEqual([
      'west-1',
      'europe-1',
      'east-1',
    ])
  })

  it('returns only the selected server without cross-server score sorting', () => {
    expect(selectPublicZvzRankingsPerServer(rankings, 'east', 2).map((row) => row.id)).toEqual([
      'east-1',
      'east-2',
    ])
  })
})

function player(input: {
  id: string
  guildId: string
  guildName: string
  allianceId?: string | null
  allianceName?: string | null
  itemPower?: number | null
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
    averageItemPower: input.itemPower ?? null,
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
    itemPower: typeof value.averageItemPower === 'number' && value.averageItemPower > 0
      ? value.averageItemPower
      : null,
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

function singleGuildAllianceBattleFixture(): AlbionBattle {
  const battle = battleFixture()
  for (let index = 1; index <= 8; index += 1) {
    const existing = battle.players[`beta-${index}`]
    battle.players[`beta-${index}`] = {
      ...existing,
      guildId: 'alpha',
      guildName: 'Alpha',
    }
  }
  delete battle.guilds.beta
  battle.guilds.alpha = {
    ...battle.guilds.alpha,
    kills: 5,
    deaths: 5,
    killFame: 2_500_000,
  }
  return battle
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
      scaleRankingEligible: true,
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

  it('stores observed average IP without treating missing IP as zero', () => {
    const battle = battleFixture()
    battle.players['alpha-1'].averageItemPower = 1500
    battle.players['alpha-2'].averageItemPower = 1700
    battle.players['beta-1'].averageItemPower = 1600
    const home = buildPublicZvzBattleProjection({
      battle,
      events: fiveEventFight(battle),
      coverage: 'complete',
      sourceHash: 'source-average-ip',
    }).engagements.find((engagement) => engagement.homeForceKey === 'a:home-alliance')

    expect(home?.evidence.find((row) => row.entityKind === 'alliance')).toMatchObject({
      averageItemPower: 1600,
      itemPowerSampleCount: 3,
    })
    expect(home?.evidence.find((row) => row.entityAlbionId === 'alpha')).toMatchObject({
      averageItemPower: 1600,
      itemPowerSampleCount: 2,
    })
  })

  it('keeps a single-guild alliance sortie in guild evidence without scoring the alliance', () => {
    const battle = singleGuildAllianceBattleFixture()
    const home = buildPublicZvzBattleProjection({
      battle,
      events: fiveEventFight(battle),
      coverage: 'complete',
      sourceHash: 'source-single-guild-sortie',
    }).engagements.find(
      (engagement) => engagement.homeForceKey === 'a:home-alliance',
    )

    expect(home).toMatchObject({
      status: 'final',
      homeSideTeamSize: 20,
      opponentSideTeamSize: 20,
    })
    expect(home?.evidence.some((row) => row.entityKind === 'alliance')).toBe(false)
    expect(home?.evidence).toEqual([
      expect.objectContaining({
        entityKind: 'guild',
        entityAlbionId: 'alpha',
        ownTeamSize: 20,
        participationShare: 1,
        battleCredit: 1,
        participationKind: 'single_guild_sortie',
      }),
    ])
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

describe('public ZvZ v5 scoring', () => {
  const evidence = [
    { ownTeamSize: 80, sideTeamSize: 80, opponentSideTeamSize: 80, battleCredit: 1, kills: 10, deaths: 5, killFame: 5_000_000 },
    { ownTeamSize: 60, sideTeamSize: 60, opponentSideTeamSize: 60, battleCredit: 0.6, kills: 7, deaths: 5, killFame: 3_000_000 },
    { ownTeamSize: 40, sideTeamSize: 40, opponentSideTeamSize: 40, battleCredit: 0.4, kills: 5, deaths: 5, killFame: 2_000_000 },
    { ownTeamSize: 20, sideTeamSize: 20, opponentSideTeamSize: 20, battleCredit: 0.2, kills: 2, deaths: 3, killFame: 500_000 },
  ]

  it('uses observed top-three deployment with diminishing returns and no player hard cap', () => {
    const score = scorePublicZvzEvidence(evidence, 'overall')
    expect(score.representativeSize).toBe(60)
    expect(score.sizePoints).toBe(131.25)
    expect(score.combatPoints).toBeLessThanOrEqual(300)
    expect(score.efficiencyPoints).toBeLessThanOrEqual(200)
    expect(score.activityPoints).toBeLessThanOrEqual(150)
    expect(score.score).toBeCloseTo(
      score.sizePoints + score.combatPoints + score.efficiencyPoints + score.activityPoints,
      2,
    )

    const hundred = scorePublicZvzEvidence([{
      ...evidence[0],
      ownTeamSize: 100,
    }], 'overall')
    const threeHundred = scorePublicZvzEvidence([{
      ...evidence[0],
      ownTeamSize: 300,
    }], 'overall')
    const aboveThreeHundred = scorePublicZvzEvidence([{
      ...evidence[0],
      ownTeamSize: 400,
    }], 'overall')
    expect(hundred.sizePoints).toBe(175)
    expect(threeHundred.sizePoints).toBe(262.5)
    expect(aboveThreeHundred.sizePoints).toBe(280)
  })

  it('does not turn an alliance side or inferred queue into guild mobilization', () => {
    const directForty = scorePublicZvzEvidence([{
      ownTeamSize: 40,
      sideTeamSize: 40,
      opponentSideTeamSize: 40,
      battleCredit: 1,
      kills: 10,
      deaths: 5,
      killFame: 5_000_000,
    }], 'overall')
    const fortyInsideLargeAlliance = scorePublicZvzEvidence([{
      ownTeamSize: 40,
      sideTeamSize: 300,
      opponentSideTeamSize: 300,
      battleCredit: 1,
      kills: 10,
      deaths: 5,
      killFame: 5_000_000,
    }], 'overall')

    expect(fortyInsideLargeAlliance.representativeSize).toBe(40)
    expect(fortyInsideLargeAlliance.sizePoints).toBe(directForty.sizePoints)
  })

  it('makes direct K/D efficiency decisive without scoring side-ratio estimates', () => {
    const efficient = scorePublicZvzEvidence([{
      ownTeamSize: 40,
      sideTeamSize: 40,
      opponentSideTeamSize: 40,
      battleCredit: 1,
      kills: 10,
      deaths: 5,
      killFame: 5_000_000,
    }], 'overall')
    const inefficient = scorePublicZvzEvidence([{
      ownTeamSize: 40,
      sideTeamSize: 40,
      opponentSideTeamSize: 40,
      battleCredit: 1,
      kills: 5,
      deaths: 10,
      killFame: 5_000_000,
    }], 'overall')
    const outnumbered = scorePublicZvzEvidence([{
      ownTeamSize: 40,
      sideTeamSize: 40,
      opponentSideTeamSize: 80,
      battleCredit: 1,
      kills: 10,
      deaths: 5,
      killFame: 5_000_000,
    }], 'overall')

    expect(efficient.efficiencyPoints).toBeGreaterThan(inefficient.efficiencyPoints)
    expect(efficient.combatPoints).toBeGreaterThan(inefficient.combatPoints)
    expect(outnumbered.efficiencyPoints).toBe(efficient.efficiencyPoints)
    expect(outnumbered.combatPoints).toBe(efficient.combatPoints)
  })

  it('shrinks one-fight K/D extremes toward neutral', () => {
    const oneCleanKill = scorePublicZvzEvidence([{
      ownTeamSize: 20,
      sideTeamSize: 20,
      opponentSideTeamSize: 20,
      battleCredit: 1,
      kills: 1,
      deaths: 0,
      killFame: 500_000,
    }], 'overall')

    expect(oneCleanKill.efficiencyIndex).toBeCloseTo(0.55, 2)
    expect(oneCleanKill.efficiencyPoints).toBeLessThan(120)
  })

  it('recomputes scale rankings from combat, K/D efficiency, and activity only', () => {
    const overall = scorePublicZvzEvidence(evidence, 'overall')
    const scoped = scorePublicZvzEvidence(evidence, 'large')
    expect(scoped.sizePoints).toBe(0)
    expect(scoped.efficiencyPoints).toBeGreaterThan(overall.efficiencyPoints)
    expect(scoped.combatPoints).toBeGreaterThan(overall.combatPoints)
    expect(scoped.activityPoints).toBe(overall.activityPoints)
    expect(scoped.combatPoints).toBeLessThanOrEqual(550)
    expect(scoped.efficiencyPoints).toBeLessThanOrEqual(300)
    expect(scoped.activityPoints).toBeLessThanOrEqual(150)
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

describe('public ZvZ comparable-scale ranking eligibility', () => {
  it('uses one symmetric scale based on the larger side', () => {
    expect(assessPublicZvzEngagementScaleMatch(39, 41)).toMatchObject({
      scale: 'large',
      scaleRankingEligible: true,
    })
    expect(assessPublicZvzEngagementScaleMatch(41, 39)).toEqual(
      assessPublicZvzEngagementScaleMatch(39, 41),
    )
  })

  it('includes exactly 75 percent and excludes anything below it', () => {
    expect(assessPublicZvzEngagementScaleMatch(30, 40)).toMatchObject({
      scale: 'mid',
      scaleRankingEligible: true,
      similarityRatio: 0.75,
    })
    expect(assessPublicZvzEngagementScaleMatch(30, 41)).toMatchObject({
      scale: 'large',
      scaleRankingEligible: false,
    })
  })

  it('keeps a two-to-one fight out of scale rankings', () => {
    expect(assessPublicZvzEngagementScaleMatch(20, 40)).toMatchObject({
      scale: 'mid',
      scaleRankingEligible: false,
      similarityRatio: 0.5,
    })
  })
})
