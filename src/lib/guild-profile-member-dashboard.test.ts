import { describe, expect, it } from 'vitest'
import {
  buildRecentBattleEnrichmentByStartedAt,
  type MemberRecentBattleEnrichRow,
} from './guild-profile-member-dashboard'

function makeRow(
  overrides: Partial<MemberRecentBattleEnrichRow> = {},
): MemberRecentBattleEnrichRow {
  return {
    id: 'tbr-1',
    battle_record_id: 'battle-1',
    started_at: '2026-01-01T10:00:00.000Z',
    home_kills: 0,
    home_deaths: 0,
    home_team_size: 0,
    primary_opponent_name: 'Opponent A',
    size_category: 'large',
    main_opponent_team_size: 0,
    ...overrides,
  }
}

describe('buildRecentBattleEnrichmentByStartedAt', () => {
  it('returns an empty map for no rows', () => {
    expect(buildRecentBattleEnrichmentByStartedAt([]).size).toBe(0)
  })

  it('keeps single battle enrichment unchanged', () => {
    const result = buildRecentBattleEnrichmentByStartedAt([
      makeRow({
        id: 'tbr-main',
        home_kills: 12,
        home_deaths: 4,
        home_team_size: 38,
        primary_opponent_name: 'Main Force',
        size_category: 'zerg',
      }),
    ])

    expect(result.get('2026-01-01T10:00:00.000Z')).toEqual({
      battleId: 'tbr-main',
      startedAt: '2026-01-01T10:00:00.000Z',
      homeKills: 12,
      homeDeaths: 4,
      homeTeamSize: 38,
      primaryOpponentName: 'Main Force',
      sizeCategory: 'zerg',
    })
  })

  it('sums guild K/D across split matchup rows and keeps the largest opponent as the link target', () => {
    const result = buildRecentBattleEnrichmentByStartedAt([
      makeRow({
        id: 'tbr-small',
        home_kills: 2,
        home_deaths: 1,
        home_team_size: 41,
        primary_opponent_name: 'Small Force',
        main_opponent_team_size: 12,
      }),
      makeRow({
        id: 'tbr-main',
        home_kills: 7,
        home_deaths: 5,
        home_team_size: 42,
        primary_opponent_name: 'Main Force',
        size_category: 'zerg',
        main_opponent_team_size: 55,
      }),
    ])

    expect(result.get('2026-01-01T10:00:00.000Z')).toEqual({
      battleId: 'tbr-main',
      startedAt: '2026-01-01T10:00:00.000Z',
      homeKills: 9,
      homeDeaths: 6,
      homeTeamSize: 42,
      primaryOpponentName: 'Main Force',
      sizeCategory: 'zerg',
    })
  })

  it('falls back to started_at as the group key for legacy rows without battle_record_id', () => {
    const result = buildRecentBattleEnrichmentByStartedAt([
      makeRow({
        id: 'legacy-a',
        battle_record_id: null,
        home_kills: 1,
        home_deaths: 0,
      }),
      makeRow({
        id: 'legacy-b',
        battle_record_id: null,
        home_kills: 3,
        home_deaths: 2,
        main_opponent_team_size: 20,
      }),
    ])

    expect(result.get('2026-01-01T10:00:00.000Z')?.homeKills).toBe(4)
    expect(result.get('2026-01-01T10:00:00.000Z')?.homeDeaths).toBe(2)
    expect(result.get('2026-01-01T10:00:00.000Z')?.battleId).toBe('legacy-b')
  })
})
