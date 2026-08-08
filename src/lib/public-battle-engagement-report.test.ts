import { describe, expect, it } from 'vitest'
import { buildPublicBattleGroupAnalysis } from './public-battle-analysis-model'
import { buildPublicBattleEngagementReport } from './public-battle-engagement-report'
import { buildPublicBattleGroupReport } from './public-battle-report-model'
import type { AlbionBattle } from './albion-battles'

function actor(id: string, allianceId: string, allianceName: string) {
  return {
    Id: id,
    Name: id,
    GuildId: `${id}-guild`,
    GuildName: `${id} Guild`,
    AllianceId: allianceId,
    AllianceName: allianceName,
  }
}

describe('buildPublicBattleEngagementReport', () => {
  it('uses only the exact projected event ids for player and force totals', () => {
    const rawBattle: AlbionBattle = {
      id: 900,
      startTime: '2026-08-08T12:00:00Z',
      endTime: '2026-08-08T12:20:00Z',
      totalKills: 2,
      totalFame: 3000,
      clusterName: null,
      alliances: {},
      guilds: {},
      players: {
        home: { id: 'home', name: 'home', guildId: 'home-guild', guildName: 'home Guild', allianceId: 'home', allianceName: 'HOME', kills: 2, deaths: 0, killFame: 3000 },
        away: { id: 'away', name: 'away', guildId: 'away-guild', guildName: 'away Guild', allianceId: 'away', allianceName: 'AWAY', kills: 0, deaths: 2, killFame: 0 },
      },
    }
    const sourceReport = buildPublicBattleGroupReport({
      server: 'east',
      requestedBattleIds: [900],
      battleRows: [{ id: 'record', albion_battle_id: 900, started_at: rawBattle.startTime, ended_at: rawBattle.endTime, total_players: 2, total_kills: 2, total_fame: 3000, cluster_name: null, raw_battle: rawBattle }],
      eventRows: [],
      preferredForceKey: 'a:home',
    })
    expect(sourceReport).not.toBeNull()
    const home = actor('home', 'home', 'HOME')
    const away = actor('away', 'away', 'AWAY')
    const event = (id: number) => ({ EventId: id, BattleId: 900, TimeStamp: `2026-08-08T12:0${id}:00Z`, TotalVictimKillFame: 1500, Killer: home, Victim: away, Participants: [home], GroupMembers: [] })
    const analysis = buildPublicBattleGroupAnalysis({
      report: sourceReport!,
      batches: [{ battleId: 900, events: [event(1), event(2)] }],
      eventIdsByBattle: new Map([[900, new Set(['2'])]]),
    })
    const scoped = buildPublicBattleEngagementReport({
      sourceReport: sourceReport!,
      analysis,
      battleId: 900,
      startedAt: '2026-08-08T12:02:00Z',
      endedAt: '2026-08-08T12:02:30Z',
      preferredForceKey: 'a:home',
    })

    expect(analysis.coverage).toMatchObject({ expected: 1, observed: 1, status: 'complete' })
    expect(analysis.events.map((item) => item.eventId)).toEqual(['2'])
    expect(scoped).toMatchObject({ totalKills: 1, totalDeaths: 1, totalFame: 1500 })
    expect(scoped?.primaryForce).toMatchObject({ forceKey: 'a:home', kills: 1, deaths: 0 })
    expect(scoped?.forces.find((force) => force.forceKey === 'a:away')).toMatchObject({ kills: 0, deaths: 1 })
    expect(scoped?.players.find((player) => player.playerId === 'home')).toMatchObject({ kills: 1, deaths: 0, killFame: 1500 })
  })
})
