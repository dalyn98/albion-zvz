import { describe, expect, it } from 'vitest'
import type { AlbionBattle } from './albion-battles'
import { buildPublicBattleGroupAnalysis } from './public-battle-analysis-model'
import {
  buildPublicBattleGroupReport,
  type PublicBattleRecordRow,
  type PublicBattleGroupReport,
} from './public-battle-report-model'

function reportFixture(totalKills = 2): PublicBattleGroupReport {
  const rawBattle: AlbionBattle = {
    id: 700,
    startTime: '2026-08-02T12:00:00Z',
    endTime: '2026-08-02T12:10:00Z',
    totalKills,
    totalFame: 3000,
    clusterName: 'Test Cluster',
    alliances: {
      home: { id: 'home', name: 'HOME', kills: 1, deaths: 1, killFame: 2000 },
      away: { id: 'away', name: 'AWAY', kills: 1, deaths: 1, killFame: 1000 },
    },
    guilds: {
      homeGuild: {
        id: 'homeGuild',
        name: 'Home Guild',
        alliance: 'HOME',
        allianceId: 'home',
        kills: 1,
        deaths: 1,
        killFame: 2000,
      },
      awayGuild: {
        id: 'awayGuild',
        name: 'Away Guild',
        alliance: 'AWAY',
        allianceId: 'away',
        kills: 1,
        deaths: 1,
        killFame: 1000,
      },
    },
    players: {
      homePlayer: {
        id: 'homePlayer',
        name: 'Home Player',
        guildId: 'homeGuild',
        guildName: 'Home Guild',
        allianceId: 'home',
        allianceName: 'HOME',
        kills: 1,
        deaths: 1,
        killFame: 2000,
      },
      awayPlayer: {
        id: 'awayPlayer',
        name: 'Away Player',
        guildId: 'awayGuild',
        guildName: 'Away Guild',
        allianceId: 'away',
        allianceName: 'AWAY',
        kills: 1,
        deaths: 1,
        killFame: 1000,
      },
    },
  }
  const row: PublicBattleRecordRow = {
    id: 'record-700',
    albion_battle_id: 700,
    started_at: rawBattle.startTime,
    ended_at: rawBattle.endTime,
    total_players: 2,
    total_kills: totalKills,
    total_fame: rawBattle.totalFame,
    cluster_name: rawBattle.clusterName,
    raw_battle: rawBattle,
  }
  const report = buildPublicBattleGroupReport({
    server: 'east',
    requestedBattleIds: [700],
    battleRows: [row],
    eventRows: [],
    highlightGuildId: 'homeGuild',
  })
  if (!report) throw new Error('fixture report was not built')
  return report
}

function actor(input: {
  id: string
  name: string
  guildId: string
  guildName: string
  allianceId: string
  allianceName: string
  ip?: number
  weapon?: string
}) {
  return {
    Id: input.id,
    Name: input.name,
    GuildId: input.guildId,
    GuildName: input.guildName,
    AllianceId: input.allianceId,
    AllianceName: input.allianceName,
    AverageItemPower: input.ip ?? 0,
    Equipment: input.weapon
      ? {
          MainHand: { Type: input.weapon, Count: 1, Quality: 4 },
          Head: { Type: 'T8_HEAD_PLATE_SET1', Count: 1, Quality: 4 },
        }
      : null,
  }
}

function killEvent(eventId: number, timestamp: string) {
  const home = actor({
    id: 'homePlayer',
    name: 'Home Player',
    guildId: 'homeGuild',
    guildName: 'Home Guild',
    allianceId: 'home',
    allianceName: 'HOME',
    ip: 1550,
    weapon: 'T8_MAIN_SWORD',
  })
  const away = actor({
    id: 'awayPlayer',
    name: 'Away Player',
    guildId: 'awayGuild',
    guildName: 'Away Guild',
    allianceId: 'away',
    allianceName: 'AWAY',
    ip: 1450,
    weapon: 'T7_2H_BOW',
  })
  return {
    EventId: eventId,
    BattleId: 700,
    TimeStamp: timestamp,
    TotalVictimKillFame: 1500,
    Killer: home,
    Victim: away,
    Participants: [
      { ...home, DamageDone: 123.5, SupportHealingDone: 45 },
      // Duplicate actors within one event are merged instead of producing
      // duplicate player observations.
      { ...home, DamageDone: 10, SupportHealingDone: 5 },
    ],
    GroupMembers: [],
  }
}

describe('buildPublicBattleGroupAnalysis', () => {
  it('deduplicates events, aggregates contribution fields, and reports complete coverage', () => {
    const first = killEvent(1, '2026-08-02T12:01:00Z')
    const second = killEvent(2, '2026-08-02T12:02:00Z')
    const analysis = buildPublicBattleGroupAnalysis({
      report: reportFixture(),
      batches: [{ battleId: 700, events: [second, first, first] }],
    })

    expect(analysis.coverage).toMatchObject({ status: 'complete', expected: 2, observed: 2 })
    expect(analysis.events.map((event) => event.eventId)).toEqual(['1', '2'])
    expect(analysis.events[0].killer).toMatchObject({
      forceKey: 'a:home',
      allianceKey: 'a:home',
      guildKey: 'g:homeGuild',
      weaponId: 'T8_MAIN_SWORD',
    })
    const home = analysis.players.find((player) => player.playerId === 'homePlayer')
    expect(home).toMatchObject({ damage: 267, healing: 100 })
    expect(home?.eventStats).toEqual([{ battleId: 700, damage: 267, healing: 100 }])
    expect(home?.observations[0]).toMatchObject({
      battleId: 700,
      itemPower: 1550,
      weaponId: 'T8_MAIN_SWORD',
    })
  })

  it('marks failed or capped event data as partial without hiding observed events', () => {
    const analysis = buildPublicBattleGroupAnalysis({
      report: reportFixture(3),
      batches: [
        {
          battleId: 700,
          events: [killEvent(1, '2026-08-02T12:01:00Z')],
          failedPageOffsets: [50],
          truncated: true,
        },
      ],
    })

    expect(analysis.coverage).toMatchObject({ status: 'partial', expected: 3, observed: 1 })
    expect(analysis.events).toHaveLength(1)
  })

  it('marks the analysis unavailable when no expected event could be loaded', () => {
    const analysis = buildPublicBattleGroupAnalysis({
      report: reportFixture(),
      batches: [{ battleId: 700, events: [], failedPageOffsets: [0] }],
    })

    expect(analysis.coverage).toMatchObject({ status: 'unavailable', expected: 2, observed: 0 })
    expect(analysis.events).toEqual([])
  })
})

