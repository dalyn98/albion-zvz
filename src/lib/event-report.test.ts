import { describe, expect, it } from 'vitest'
import { buildEventReport } from './event-report'

const profiles = new Map([
  [
    'discord-a',
    {
      discord_id: 'discord-a',
      username: 'Assigned A',
      avatar: null,
    },
  ],
  [
    'discord-b',
    {
      discord_id: 'discord-b',
      username: 'No Show B',
      avatar: null,
    },
  ],
  [
    'discord-c',
    {
      discord_id: 'discord-c',
      username: 'Walk In C',
      avatar: null,
    },
  ],
])

describe('buildEventReport — event attendance vs battle participation', () => {
  it('keeps linked battle projections in operational order', () => {
    const second = {
      id: 'projection-2',
      battle_number: 2,
      albion_battle_id: 1002,
      started_at: '2026-05-22T12:20:00.000Z',
      opponent_force_name: 'Second Force',
      result_estimate: 'disadvantage' as const,
      projection_status: 'final' as const,
      evidence_source: 'battle_summary' as const,
      view_policy: 'default_meaningful' as const,
      activity_kind: 'zvz' as const,
      activity_source: 'automatic' as const,
      activity_reason: 'disarray_scale_mutual_or_sustained',
      evaluated_at: '2026-05-22T12:21:00.000Z',
      subject_kills: 4,
      subject_deaths: 8,
      subject_kill_fame: 100,
      opponent_kills: 8,
      opponent_deaths: 4,
      opponent_kill_fame: 200,
    }
    const first = {
      ...second,
      id: 'projection-1',
      battle_number: 1,
      albion_battle_id: 1001,
      opponent_force_name: 'First Force',
      result_estimate: 'advantage' as const,
    }

    const report = buildEventReport({
      profiles,
      battles: [second, first],
      regear: [],
      slots: [],
      killboard: [],
    })

    expect(report.battles.map((battle) => battle.id)).toEqual(['projection-1', 'projection-2'])
  })

  it('counts tracked battles even before roster participation can be resolved', () => {
    const report = buildEventReport({
      profiles,
      battles: [],
      trackedBattleIds: [1001, 1002, 1002],
      regear: [],
      slots: [],
      killboard: [],
      battleParticipations: [],
    })

    expect(report.attendance.linkedBattleCount).toBe(2)
  })

  it('counts one confirmed event attendance separately from multiple battle participations', () => {
    const report = buildEventReport({
      profiles,
      battles: [],
      regear: [],
      slots: [
        { assigned_discord_id: 'discord-a', role_name: 'Healer' },
        { assigned_discord_id: 'discord-b', role_name: 'EngageDps' },
      ],
      killboard: [],
      battleParticipations: [
        {
          discord_id: 'discord-a',
          albion_player_id: 'albion-a',
          albion_name: 'AssignedA',
          battle_id: 1001,
        },
        {
          discord_id: 'discord-a',
          albion_player_id: 'albion-a',
          albion_name: 'AssignedA',
          battle_id: 1002,
        },
        {
          discord_id: 'discord-a',
          albion_player_id: 'albion-a',
          albion_name: 'AssignedA',
          battle_id: 1003,
        },
        {
          discord_id: 'discord-c',
          albion_player_id: 'albion-c',
          albion_name: 'WalkInC',
          battle_id: 1001,
        },
        {
          discord_id: 'discord-c',
          albion_player_id: 'albion-c',
          albion_name: 'WalkInC',
          battle_id: 1002,
        },
        {
          discord_id: 'discord-c',
          albion_player_id: 'albion-c',
          albion_name: 'WalkInC',
          battle_id: 1003,
        },
      ],
    })

    expect(report.participation.uniqueAssigned).toBe(2)
    expect(report.attendance.confirmedAssigned).toBe(1)
    expect(report.attendance.unconfirmedAssigned).toBe(1)
    expect(report.attendance.unassignedBattleParticipants).toBe(1)
    expect(report.attendance.battleParticipations).toBe(6)
    expect(report.attendance.linkedBattleCount).toBe(3)
    expect(report.attendance.eventAttendanceRate).toBe(0.5)
  })

  it('keeps assigned no-shows out of survival denominator and marks unassigned battle members', () => {
    const report = buildEventReport({
      profiles,
      battles: [],
      regear: [],
      slots: [
        { assigned_discord_id: 'discord-a', role_name: 'Healer' },
        { assigned_discord_id: 'discord-b', role_name: 'EngageDps' },
      ],
      killboard: [
        {
          discord_id: 'discord-a',
          albion_player_id: 'albion-a',
          role: 'victim',
          occurred_at: '2026-05-22T12:10:00.000Z',
          battle_id: 1001,
        },
      ],
      battleParticipations: [
        {
          discord_id: 'discord-a',
          albion_player_id: 'albion-a',
          albion_name: 'AssignedA',
          battle_id: 1001,
        },
        {
          discord_id: 'discord-c',
          albion_player_id: 'albion-c',
          albion_name: 'WalkInC',
          battle_id: 1001,
        },
      ],
    })

    expect(report.survival.attended).toBe(2)
    expect(report.survival.died).toBe(1)
    expect(report.survival.survived).toBe(1)
    expect(report.attendance.participants.map((p) => [p.username, p.status])).toEqual([
      ['Assigned A', 'confirmed_assigned'],
      ['No Show B', 'assigned_no_battle'],
      ['Walk In C', 'unassigned_battle'],
    ])
  })

  it('keeps missing slot roles as null so the UI can localize the fallback', () => {
    const report = buildEventReport({
      profiles,
      battles: [],
      regear: [],
      slots: [
        { assigned_discord_id: 'discord-a', role_name: null },
        { assigned_discord_id: 'discord-b', role_name: '기타' },
      ],
      killboard: [],
      battleParticipations: [],
    })

    expect(report.participation.roleBreakdown).toEqual([
      { role: null, count: 1 },
      { role: '기타', count: 1 },
    ])
  })
})
