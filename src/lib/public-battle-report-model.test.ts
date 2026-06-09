import { describe, expect, it } from 'vitest'
import {
  buildPublicBattleGroupReport,
  normalizePublicBattleGroupParams,
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
  })
})

describe('buildPublicBattleGroupReport', () => {
  it('bundles split matchup rows before summing multiple battle ids', () => {
    const report = buildPublicBattleGroupReport({
      server: 'east',
      requestedBattleIds: [100, 101, 102],
      battleRows: [
        {
          id: 'record-100',
          albion_battle_id: 100,
          started_at: '2026-05-28T12:00:00Z',
          ended_at: '2026-05-28T12:10:00Z',
          total_players: 90,
          total_fame: 8_000_000,
          cluster_name: 'Darkbough Snag',
        },
        {
          id: 'record-101',
          albion_battle_id: 101,
          started_at: '2026-05-28T12:18:00Z',
          ended_at: '2026-05-28T12:30:00Z',
          total_players: 70,
          total_fame: 6_000_000,
          cluster_name: 'Darkbough Snag',
        },
      ],
      tenantRows: [
        {
          id: 'tenant-100-a',
          battle_record_id: 'record-100',
          home_guild_name: 'Menhera',
          home_team_size: 36,
          home_kills: 10,
          home_deaths: 4,
          home_kill_fame: 2_000_000,
          main_opponent_force_name: 'Enemy A',
          main_opponent_team_size: 30,
          primary_opponent_name: 'Enemy A',
          opponent_team_size: 30,
          started_at: '2026-05-28T12:00:00Z',
          outcome: 'win',
          is_provisional: false,
        },
        {
          id: 'tenant-100-b',
          battle_record_id: 'record-100',
          home_guild_name: 'Menhera',
          home_team_size: 36,
          home_kills: 6,
          home_deaths: 3,
          home_kill_fame: 1_500_000,
          main_opponent_force_name: 'Enemy B',
          main_opponent_team_size: 18,
          primary_opponent_name: 'Enemy B',
          opponent_team_size: 18,
          started_at: '2026-05-28T12:00:00Z',
          outcome: 'win',
          is_provisional: false,
        },
        {
          id: 'tenant-101',
          battle_record_id: 'record-101',
          home_guild_name: 'Menhera',
          home_team_size: 33,
          home_kills: 8,
          home_deaths: 5,
          home_kill_fame: 1_800_000,
          main_opponent_force_name: 'Enemy C',
          main_opponent_team_size: 40,
          primary_opponent_name: 'Enemy C',
          opponent_team_size: 40,
          started_at: '2026-05-28T12:18:00Z',
          outcome: 'loss',
          is_provisional: false,
        },
      ],
      eventRows: [
        {
          event_id: 1,
          battle_id: 100,
          role: 'killer',
          player_name: 'Caller',
          fame: 1_000_000,
          occurred_at: '2026-05-28T12:01:00Z',
        },
        {
          event_id: 2,
          battle_id: 101,
          role: 'victim',
          player_name: 'Caller',
          fame: 500_000,
          occurred_at: '2026-05-28T12:19:00Z',
        },
        {
          event_id: 3,
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
    expect(report?.homeTeamSizeMax).toBe(36)
    expect(report?.opponentTeamSizeTotal).toBe(88)
    expect(report?.homeKills).toBe(24)
    expect(report?.homeDeaths).toBe(12)
    expect(report?.homeKillFame).toBe(5_300_000)
    expect(report?.opponentNames).toEqual(['Enemy A', 'Enemy B', 'Enemy C'])
    expect(report?.topKills[0]).toMatchObject({ playerName: 'Caller', kills: 1, deaths: 1 })
    expect(report?.recentEvents.map((event) => event.eventId)).toEqual(['1', '2'])
  })
})
