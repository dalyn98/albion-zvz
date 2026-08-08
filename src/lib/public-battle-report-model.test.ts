import { describe, expect, it } from 'vitest'
import type { AlbionBattle, AlbionBattlePlayer } from './albion-battles'
import {
  buildPublicBattleGroupReport,
  normalizePublicBattleGroupParams,
  type PublicBattleRecordRow,
} from './public-battle-report-model'

describe('normalizePublicBattleGroupParams', () => {
  it('sorts and deduplicates public battle ids', () => {
    expect(normalizePublicBattleGroupParams({ server: 'east', ids: '3,2,3,1' })).toEqual({
      ok: true,
      params: {
        server: 'east',
        ids: [1, 2, 3],
        canonicalIds: '1,2,3',
      },
    })
  })

  it('rejects unsupported servers and empty battle ids', () => {
    expect(normalizePublicBattleGroupParams({ server: 'north', ids: '1' })).toEqual({
      ok: false,
      error: 'invalid_server',
    })
    expect(normalizePublicBattleGroupParams({ server: 'east', ids: 'abc' })).toEqual({
      ok: false,
      error: 'invalid_ids',
    })
    expect(normalizePublicBattleGroupParams({ server: 'east', ids: '1,abc' })).toEqual({
      ok: false,
      error: 'invalid_ids',
    })
    expect(normalizePublicBattleGroupParams({ server: 'east', ids: '1,' })).toEqual({
      ok: false,
      error: 'invalid_ids',
    })
  })
})

interface ForceFixture {
  forceName: string
  allianceId: string | null
  guildId: string
  guildName: string
  players: number
  kills: number
  deaths: number
  fame: number
}

function distribute(total: number, count: number, index: number): number {
  const base = Math.floor(total / count)
  return base + (index < total % count ? 1 : 0)
}

function forcePlayers(battleId: number, force: ForceFixture): Record<string, AlbionBattlePlayer> {
  const players: Record<string, AlbionBattlePlayer> = {}
  for (let i = 0; i < force.players; i += 1) {
    const id = `${force.guildId}-p${i}`
    players[id] = {
      id,
      name: `${force.forceName} Player ${i + 1}`,
      guildId: force.guildId,
      guildName: force.guildName,
      allianceId: force.allianceId,
      allianceName: force.allianceId ? force.forceName : null,
      kills: distribute(force.kills, force.players, i),
      deaths: distribute(force.deaths, force.players, i),
      killFame: distribute(force.fame, force.players, i),
    }
  }
  return players
}

function battleRecord(
  battleId: number,
  startedAt: string,
  forces: ForceFixture[],
): PublicBattleRecordRow {
  const players = forces.reduce<Record<string, AlbionBattlePlayer>>(
    (acc, force) => ({ ...acc, ...forcePlayers(battleId, force) }),
    {},
  )
  const alliances = Object.fromEntries(
    forces
      .filter((force) => force.allianceId)
      .map((force) => [
        force.allianceId,
        {
          id: force.allianceId,
          name: force.forceName,
          kills: force.kills,
          deaths: force.deaths,
          killFame: force.fame,
        },
      ]),
  )
  const guilds = Object.fromEntries(
    forces.map((force) => [
      force.guildId,
      {
        id: force.guildId,
        name: force.guildName,
        alliance: force.allianceId ? force.forceName : '',
        allianceId: force.allianceId ?? '',
        kills: force.kills,
        deaths: force.deaths,
        killFame: force.fame,
      },
    ]),
  )
  const totalKills = forces.reduce((sum, force) => sum + force.kills, 0)
  const totalFame = forces.reduce((sum, force) => sum + force.fame, 0)
  const rawBattle: AlbionBattle = {
    id: battleId,
    startTime: startedAt,
    endTime: new Date(Date.parse(startedAt) + 10 * 60 * 1000).toISOString(),
    totalKills,
    totalFame,
    clusterName: 'Darkbough Snag',
    players,
    guilds,
    alliances,
  }
  return {
    id: `record-${battleId}`,
    albion_battle_id: battleId,
    started_at: rawBattle.startTime,
    ended_at: rawBattle.endTime,
    total_players: Object.keys(players).length,
    total_kills: rawBattle.totalKills,
    total_fame: rawBattle.totalFame,
    cluster_name: rawBattle.clusterName,
    raw_battle: rawBattle,
  }
}

describe('buildPublicBattleGroupReport', () => {
  it('uses the preferred force as the public report focus without overriding a tenant highlight', () => {
    const rows = [
      battleRecord(99, '2026-05-28T11:00:00Z', [
        {
          forceName: 'LARGE',
          allianceId: 'large-alliance',
          guildId: 'large-guild',
          guildName: 'Large Guild',
          players: 40,
          kills: 2,
          deaths: 8,
          fame: 2_000,
        },
        {
          forceName: 'KILLERS',
          allianceId: 'killers-alliance',
          guildId: 'killers-guild',
          guildName: 'Killers Guild',
          players: 20,
          kills: 8,
          deaths: 2,
          fame: 8_000,
        },
      ]),
    ]
    const preferred = buildPublicBattleGroupReport({
      server: 'east',
      requestedBattleIds: [99],
      battleRows: rows,
      eventRows: [],
      preferredForceKey: 'a:large-alliance',
    })
    expect(preferred?.primaryForce).toMatchObject({
      forceKey: 'a:large-alliance',
      highlighted: false,
    })

    const highlighted = buildPublicBattleGroupReport({
      server: 'east',
      requestedBattleIds: [99],
      battleRows: rows,
      eventRows: [],
      preferredForceKey: 'a:large-alliance',
      highlightGuildId: 'killers-guild',
    })
    expect(highlighted?.primaryForce.forceKey).toBe('a:killers-alliance')
  })

  it('sums Albion raw battle players by force without tenant ZvZ rows', () => {
    const report = buildPublicBattleGroupReport({
      server: 'east',
      requestedBattleIds: [100, 101, 102],
      highlightGuildId: 'gru-guild',
      battleRows: [
        battleRecord(100, '2026-05-28T12:00:00Z', [
          {
            forceName: 'GRU',
            allianceId: 'gru-alliance',
            guildId: 'gru-guild',
            guildName: 'MINlONS',
            players: 36,
            kills: 40,
            deaths: 10,
            fame: 30_000_000,
          },
          {
            forceName: 'NTR',
            allianceId: 'ntr-alliance',
            guildId: 'ntr-guild',
            guildName: 'GOBLINS',
            players: 46,
            kills: 20,
            deaths: 16,
            fame: 10_000_000,
          },
          {
            forceName: 'YENA',
            allianceId: 'yena-alliance',
            guildId: 'yena-guild',
            guildName: 'YENA Main',
            players: 35,
            kills: 5,
            deaths: 20,
            fame: 2_000_000,
          },
          {
            forceName: '5G',
            allianceId: '5g-alliance',
            guildId: '5g-guild',
            guildName: '5G Main',
            players: 43,
            kills: 1,
            deaths: 13,
            fame: 200_000,
          },
        ]),
        battleRecord(101, '2026-05-28T12:20:00Z', [
          {
            forceName: 'GRU',
            allianceId: 'gru-alliance',
            guildId: 'gru-guild',
            guildName: 'MINlONS',
            players: 36,
            kills: 44,
            deaths: 12,
            fame: 32_513_430,
          },
          {
            forceName: 'NTR',
            allianceId: 'ntr-alliance',
            guildId: 'ntr-guild',
            guildName: 'GOBLINS',
            players: 46,
            kills: 12,
            deaths: 16,
            fame: 6_494_046,
          },
          {
            forceName: 'YENA',
            allianceId: 'yena-alliance',
            guildId: 'yena-guild',
            guildName: 'YENA Main',
            players: 35,
            kills: 3,
            deaths: 24,
            fame: 1_126_201,
          },
          {
            forceName: '5G',
            allianceId: '5g-alliance',
            guildId: '5g-guild',
            guildName: '5G Main',
            players: 43,
            kills: 2,
            deaths: 16,
            fame: 369_332,
          },
        ]),
      ],
      eventRows: [
        {
          event_id: 1,
          battle_id: 100,
          role: 'killer',
          player_name: 'GRU Player 1',
          fame: 1_000_000,
          occurred_at: '2026-05-28T12:01:00Z',
        },
        {
          event_id: 2,
          battle_id: 999,
          role: 'killer',
          player_name: 'Noise',
          fame: 9_000_000,
          occurred_at: '2026-05-28T12:20:00Z',
        },
      ],
    })

    expect(report).not.toBeNull()
    expect(report?.battleCount).toBe(2)
    expect(report?.unavailableBattleIds).toEqual([102])
    expect(report?.totalPlayersUnique).toBe(160)
    expect(report?.forces.map((force) => ({
      name: force.forceName,
      players: force.players,
      kills: force.kills,
      deaths: force.deaths,
      fame: force.killFame,
      highlighted: force.highlighted,
    }))).toEqual([
      { name: 'GRU', players: 36, kills: 84, deaths: 22, fame: 62_513_430, highlighted: true },
      { name: 'NTR', players: 46, kills: 32, deaths: 32, fame: 16_494_046, highlighted: false },
      { name: 'YENA', players: 35, kills: 8, deaths: 44, fame: 3_126_201, highlighted: false },
      { name: '5G', players: 43, kills: 3, deaths: 29, fame: 569_332, highlighted: false },
    ])
    expect(report?.primaryForceName).toBe('GRU')
    expect(report?.alliances.map((force) => force.forceName)).toEqual(['GRU', 'NTR', 'YENA', '5G'])
    expect(report?.guilds.map((force) => force.forceName)).toEqual([
      'MINlONS',
      'GOBLINS',
      'YENA Main',
      '5G Main',
    ])
    expect(report?.players[0]).toMatchObject({
      playerName: 'GRU Player 1',
      forceKey: 'a:gru-alliance',
      guildId: 'gru-guild',
      allianceId: 'gru-alliance',
      battleIds: [100, 101],
    })
    expect(report?.players[0].battleStats).toHaveLength(2)
    expect(report?.recentEvents.map((event) => event.eventId)).toEqual(['1'])
  })
})
