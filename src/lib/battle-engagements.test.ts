import { describe, expect, it } from 'vitest'
import type {
  AlbionBattle,
  AlbionBattleGuild,
  AlbionBattlePlayer,
} from './albion-battles'
import {
  buildBattleEngagementProjection,
  hashBattleEngagementSource,
  judgeBattleEngagementResult,
  type BattleEngagementEventEvidence,
} from './battle-engagements'

const HOME_GUILD_ID = 'home'
const HOME_PLAYER_ID = 'home-player-0'
const STARTED_AT = '2026-07-24T00:00:00.000Z'

interface GuildFixture {
  id: string
  name: string
  teamSize: number
  kills?: number
  deaths?: number
  killFame?: number
  allianceId?: string
  allianceName?: string
}

function makeBattle(guildFixtures: GuildFixture[], durationMinutes = 30): AlbionBattle {
  const guilds: Record<string, AlbionBattleGuild> = {}
  const players: Record<string, AlbionBattlePlayer> = {}
  for (const fixture of guildFixtures) {
    guilds[fixture.id] = {
      id: fixture.id,
      name: fixture.name,
      kills: fixture.kills ?? 0,
      deaths: fixture.deaths ?? 0,
      killFame: fixture.killFame ?? 0,
      allianceId: fixture.allianceId ?? '',
      alliance: fixture.allianceName ?? '',
    }
    for (let index = 0; index < fixture.teamSize; index += 1) {
      const playerId =
        fixture.id === HOME_GUILD_ID && index === 0
          ? HOME_PLAYER_ID
          : `${fixture.id}-player-${index}`
      players[playerId] = {
        id: playerId,
        name: playerId,
        kills: 0,
        deaths: 0,
        killFame: 0,
        guildId: fixture.id,
        guildName: fixture.name,
        allianceId: fixture.allianceId ?? null,
        allianceName: fixture.allianceName ?? null,
      }
    }
  }

  return {
    id: 12345,
    startTime: STARTED_AT,
    endTime: new Date(
      Date.parse(STARTED_AT) + durationMinutes * 60 * 1000,
    ).toISOString(),
    totalFame: guildFixtures.reduce((sum, guild) => sum + (guild.killFame ?? 0), 0),
    totalKills: guildFixtures.reduce((sum, guild) => sum + (guild.kills ?? 0), 0),
    clusterName: 'Test Cluster',
    players,
    guilds,
    alliances: Object.fromEntries(
      guildFixtures
        .filter((guild) => guild.allianceId)
        .map((guild) => [
          guild.allianceId!,
          {
            id: guild.allianceId!,
            name: guild.allianceName ?? guild.allianceId!,
            kills: 0,
            deaths: 0,
            killFame: 0,
          },
        ]),
    ),
  }
}

function atMinute(minute: number, second = 0): string {
  return new Date(
    Date.parse(STARTED_AT) + minute * 60 * 1000 + second * 1000,
  ).toISOString()
}

function event(
  id: number,
  role: 'killer' | 'victim',
  opponentGuildId: string | null,
  minute: number,
  fame = 1_000,
): BattleEngagementEventEvidence {
  const opponentNames: Record<string, string> = {
    a: 'Opponent A',
    b: 'Opponent B',
    tiny: 'Tiny',
  }
  return {
    eventId: String(id),
    battleId: 12345,
    role,
    sourcePlayerId: HOME_PLAYER_ID,
    sourceGuildId: HOME_GUILD_ID,
    sourceAllianceId: null,
    opponentGuildId,
    opponentGuildName: opponentGuildId ? opponentNames[opponentGuildId] : null,
    opponentAllianceId: null,
    opponentAllianceName: null,
    fame,
    fameIsObserved: true,
    occurredAt: atMinute(minute, id % 30),
  }
}

function build(input: {
  battle: AlbionBattle
  events: BattleEngagementEventEvidence[]
  sourceObservationCount?: number
}) {
  return buildBattleEngagementProjection({
    battle: input.battle,
    homeGuildId: HOME_GUILD_ID,
    events: input.events,
    sourceObservationCount: input.sourceObservationCount ?? 2,
    evaluatedAt: '2026-07-24T01:00:00.000Z',
  })
}

describe('judgeBattleEngagementResult', () => {
  it('킬 수와 킬페임이 같은 방향으로 각각 20% 이상 차이 나야 우세다', () => {
    expect(
      judgeBattleEngagementResult({
        homeKills: 6,
        homeDeaths: 5,
        homeKillFame: 1_200,
        opponentKillFame: 1_000,
        eligibleEventCount: 11,
      }),
    ).toBe('advantage')
  })

  it('킬 수와 킬페임의 방향이 다르면 박빙이다', () => {
    expect(
      judgeBattleEngagementResult({
        homeKills: 8,
        homeDeaths: 5,
        homeKillFame: 900,
        opponentKillFame: 1_500,
        eligibleEventCount: 13,
      }),
    ).toBe('even')
  })

  it('직접 이벤트가 5건 미만이면 판정을 보류한다', () => {
    expect(
      judgeBattleEngagementResult({
        homeKills: 4,
        homeDeaths: 0,
        homeKillFame: 4_000,
        opponentKillFame: 0,
        eligibleEventCount: 4,
      }),
    ).toBeNull()
  })
})

describe('buildBattleEngagementProjection', () => {
  it('같은 원본을 두 번 확인하기 전에는 완전한 이벤트여도 판정 중이다', () => {
    const battle = makeBattle([
      { id: HOME_GUILD_ID, name: 'Home', teamSize: 20, kills: 3, deaths: 2 },
      { id: 'a', name: 'Opponent A', teamSize: 20 },
    ])
    const run = build({
      battle,
      sourceObservationCount: 1,
      events: [
        event(1, 'killer', 'a', 1),
        event(2, 'killer', 'a', 1),
        event(3, 'killer', 'a', 2),
        event(4, 'victim', 'a', 2),
        event(5, 'victim', 'a', 3),
      ],
    })

    expect(run.state).toBe('collecting')
    expect(run.reason).toBe('source_not_stable')
    expect(run.engagements[0].status).toBe('pending')
    expect(run.engagements[0].result).toBeNull()
  })

  it('원본 K/D와 직접 이벤트 K/D가 모두 맞아야 확정한다', () => {
    const battle = makeBattle([
      { id: HOME_GUILD_ID, name: 'Home', teamSize: 20, kills: 4, deaths: 2 },
      { id: 'a', name: 'Opponent A', teamSize: 20 },
    ])
    const run = build({
      battle,
      events: [
        event(1, 'killer', 'a', 1),
        event(2, 'killer', 'a', 1),
        event(3, 'killer', 'a', 2),
        event(4, 'victim', 'a', 2),
        event(5, 'victim', 'a', 3),
      ],
    })

    expect(run.state).toBe('collecting')
    expect(run.reason).toBe('event_count_incomplete')
    expect(run.rawHomeKills).toBe(4)
    expect(run.collectedHomeKills).toBe(3)
  })

  it('한쪽 데스만 있어도 직접 교전 증거로 인정한다', () => {
    const battle = makeBattle([
      { id: HOME_GUILD_ID, name: 'Home', teamSize: 20, kills: 0, deaths: 5 },
      { id: 'a', name: 'Opponent A', teamSize: 20 },
    ])
    const run = build({
      battle,
      events: [
        event(1, 'victim', 'a', 1),
        event(2, 'victim', 'a', 1),
        event(3, 'victim', 'a', 2),
        event(4, 'victim', 'a', 2),
        event(5, 'victim', 'a', 3),
      ],
    })

    expect(run.state).toBe('ready')
    expect(run.engagements).toHaveLength(1)
    expect(run.engagements[0].status).toBe('final')
    expect(run.engagements[0].result).toBe('disadvantage')
  })

  it('두 번째 상대의 단일 이벤트는 개입으로 표시하고 판정에서는 제외한다', () => {
    const battle = makeBattle([
      { id: HOME_GUILD_ID, name: 'Home', teamSize: 20, kills: 5, deaths: 1 },
      { id: 'a', name: 'Opponent A', teamSize: 20 },
      { id: 'b', name: 'Opponent B', teamSize: 20 },
    ])
    const run = build({
      battle,
      events: [
        event(1, 'killer', 'a', 1, 2_000),
        event(2, 'killer', 'a', 1, 2_000),
        event(3, 'killer', 'a', 2, 2_000),
        event(4, 'killer', 'a', 2, 2_000),
        event(5, 'victim', 'a', 3, 1_000),
        event(6, 'killer', 'b', 3, 9_000),
      ],
    })

    const engagement = run.engagements[0]
    expect(engagement.homeKills).toBe(5)
    expect(engagement.resultHomeKills).toBe(4)
    expect(engagement.resultEligibleEventCount).toBe(5)
    expect(engagement.interventionEventCount).toBe(1)
    expect(engagement.matchups.map((matchup) => [matchup.forceKey, matchup.role])).toEqual([
      ['g:a', 'result_eligible'],
      ['g:b', 'intervention'],
    ])
    expect(engagement.result).toBe('advantage')
  })

  it('같은 상대라도 8분 이상 이벤트 공백이면 별도 교전으로 분리한다', () => {
    const battle = makeBattle([
      { id: HOME_GUILD_ID, name: 'Home', teamSize: 20, kills: 2, deaths: 2 },
      { id: 'a', name: 'Opponent A', teamSize: 20 },
    ])
    const run = build({
      battle,
      events: [
        event(1, 'killer', 'a', 1),
        event(2, 'victim', 'a', 1),
        event(3, 'killer', 'a', 11),
        event(4, 'victim', 'a', 11),
      ],
    })

    expect(run.state).toBe('ready')
    expect(run.engagements).toHaveLength(2)
    expect(run.engagements.map((engagement) => engagement.sequence)).toEqual([1, 2])
  })

  it('2~8분 사이의 경계는 임의 확정하지 않고 교전 구분 필요로 남긴다', () => {
    const battle = makeBattle([
      { id: HOME_GUILD_ID, name: 'Home', teamSize: 20, kills: 1, deaths: 1 },
      { id: 'a', name: 'Opponent A', teamSize: 20 },
    ])
    const run = build({
      battle,
      events: [
        event(1, 'killer', 'a', 1),
        event(2, 'victim', 'a', 5),
      ],
    })

    expect(run.state).toBe('segmentation_required')
    expect(run.reason).toBe('ambiguous_boundary')
    expect(run.engagements).toHaveLength(2)
    expect(run.engagements.every((engagement) => engagement.result === null)).toBe(true)
    expect(
      run.engagements.every(
        (engagement) => engagement.status === 'segmentation_required',
      ),
    ).toBe(true)
  })

  it('길드 없는 이벤트는 기타 교전으로 K/D 대조에는 포함하되 결과에서는 제외한다', () => {
    const battle = makeBattle([
      { id: HOME_GUILD_ID, name: 'Home', teamSize: 20, kills: 1, deaths: 0 },
    ])
    const run = build({
      battle,
      events: [event(1, 'killer', null, 1)],
    })

    expect(run.state).toBe('ready')
    expect(run.collectedHomeKills).toBe(1)
    expect(run.engagements).toHaveLength(1)
    expect(run.engagements[0].isOtherOnly).toBe(true)
    expect(run.engagements[0].otherEventCount).toBe(1)
    expect(run.engagements[0].resultEligibleEventCount).toBe(0)
    expect(run.engagements[0].status).toBe('insufficient_evidence')
  })

  it('판정 제외 이벤트만 있어도 8분 이상 떨어진 실제 흐름은 별도 교전으로 나눈다', () => {
    const battle = makeBattle([
      { id: HOME_GUILD_ID, name: 'Home', teamSize: 20, kills: 2, deaths: 0 },
    ])
    const run = build({
      battle,
      events: [
        event(1, 'killer', null, 1),
        event(2, 'killer', null, 11),
      ],
    })

    expect(run.state).toBe('ready')
    expect(run.engagements).toHaveLength(2)
    expect(
      run.engagements.map((engagement) => ({
        sequence: engagement.sequence,
        isOtherOnly: engagement.isOtherOnly,
        otherEventCount: engagement.otherEventCount,
      })),
    ).toEqual([
      { sequence: 1, isOtherOnly: true, otherEventCount: 1 },
      { sequence: 2, isOtherOnly: true, otherEventCount: 1 },
    ])
  })

  it('판정 대상 싸움에서 멀리 떨어진 기타 이벤트를 독립 교전으로 보존한다', () => {
    const battle = makeBattle([
      { id: HOME_GUILD_ID, name: 'Home', teamSize: 20, kills: 2, deaths: 0 },
      { id: 'a', name: 'Opponent A', teamSize: 20 },
    ])
    const run = build({
      battle,
      events: [
        event(1, 'killer', 'a', 1),
        event(2, 'killer', null, 11),
      ],
    })

    expect(run.state).toBe('ready')
    expect(run.engagements).toHaveLength(2)
    expect(run.engagements[0]).toMatchObject({
      sequence: 1,
      resultEligibleEventCount: 1,
      otherEventCount: 0,
      isOtherOnly: false,
    })
    expect(run.engagements[1]).toMatchObject({
      sequence: 2,
      resultEligibleEventCount: 0,
      otherEventCount: 1,
      isOtherOnly: true,
    })
  })

  it('원본과 모순되는 상대 ID는 식별 불가로 차단한다', () => {
    const battle = makeBattle([
      { id: HOME_GUILD_ID, name: 'Home', teamSize: 20, kills: 0, deaths: 0 },
      { id: 'a', name: 'Opponent A', teamSize: 20 },
    ])
    const run = build({
      battle,
      events: [event(1, 'killer', 'not-in-source', 1)],
    })

    expect(run.state).toBe('blocked')
    expect(run.reason).toBe('unidentified_event')
    expect(run.unidentifiedEventCount).toBe(1)
  })

  it('킬페임이 응답에서 누락된 이벤트는 0으로 간주하지 않고 차단한다', () => {
    const battle = makeBattle([
      { id: HOME_GUILD_ID, name: 'Home', teamSize: 20, kills: 1, deaths: 0 },
      { id: 'a', name: 'Opponent A', teamSize: 20 },
    ])
    const missingFame = {
      ...event(1, 'killer', 'a', 1, 0),
      fameIsObserved: false,
    }
    const run = build({ battle, events: [missingFame] })

    expect(run.state).toBe('blocked')
    expect(run.reason).toBe('unidentified_event')
    expect(run.unidentifiedEventCount).toBe(1)
  })

  it('홈 측도 10명 미만이면 사실 K/D만 남기고 결과에서는 제외한다', () => {
    const battle = makeBattle([
      { id: HOME_GUILD_ID, name: 'Home', teamSize: 9, kills: 5, deaths: 0 },
      { id: 'a', name: 'Opponent A', teamSize: 20 },
    ])
    const run = build({
      battle,
      events: [
        event(1, 'killer', 'a', 1),
        event(2, 'killer', 'a', 1),
        event(3, 'killer', 'a', 2),
        event(4, 'killer', 'a', 2),
        event(5, 'killer', 'a', 3),
      ],
    })

    expect(run.state).toBe('ready')
    expect(run.engagements[0]).toMatchObject({
      homeKills: 5,
      resultEligibleEventCount: 0,
      otherEventCount: 5,
      isOtherOnly: true,
      status: 'insufficient_evidence',
      result: null,
    })
  })

  it('같은 event/role에 상충하는 payload가 오면 중복 링크 없이 식별 오류로 차단한다', () => {
    const battle = makeBattle([
      { id: HOME_GUILD_ID, name: 'Home', teamSize: 20, kills: 0, deaths: 0 },
      { id: 'a', name: 'Opponent A', teamSize: 20 },
    ])
    const first = event(1, 'killer', 'a', 1)
    const run = build({
      battle,
      events: [first, { ...first, fame: first.fame + 1 }],
    })

    expect(run.state).toBe('blocked')
    expect(run.unidentifiedEventCount).toBe(1)
    expect(run.unassignedEvents).toHaveLength(1)
    expect(run.unassignedEvents[0]).toMatchObject({
      eventId: '1',
      role: 'killer',
      classification: 'unidentified',
    })
  })

  it('이벤트 당시 홈 길드 소속이 아닌 행은 결과와 원본 K/D 대조에서 제외한다', () => {
    const battle = makeBattle([
      {
        id: HOME_GUILD_ID,
        name: 'Home',
        teamSize: 20,
        kills: 0,
        deaths: 0,
        allianceId: 'home-alliance',
      },
      {
        id: 'a',
        name: 'Opponent A',
        teamSize: 20,
        allianceId: 'enemy-alliance',
      },
    ])
    const staleMembershipEvent = {
      ...event(1, 'killer', 'a', 1),
      sourceGuildId: 'a',
      sourcePlayerId: 'a-player-0',
      sourceAllianceId: 'enemy-alliance',
    }
    const run = build({
      battle,
      events: [staleMembershipEvent],
    })

    expect(run.state).toBe('ready')
    expect(run.collectedHomeKills).toBe(0)
    expect(run.ignoredNonHomeEventCount).toBe(1)
    expect(run.unassignedEvents[0].classification).toBe('not_home_source')
  })
})

describe('hashBattleEngagementSource', () => {
  it('객체 키 순서와 무관하게 같은 원본 해시를 만든다', () => {
    const battle = makeBattle([
      { id: HOME_GUILD_ID, name: 'Home', teamSize: 10 },
      { id: 'a', name: 'Opponent A', teamSize: 10 },
    ])
    const reordered = JSON.parse(JSON.stringify(battle)) as AlbionBattle
    reordered.guilds = Object.fromEntries(Object.entries(reordered.guilds).reverse())

    expect(hashBattleEngagementSource(reordered)).toBe(
      hashBattleEngagementSource(battle),
    )
  })
})
