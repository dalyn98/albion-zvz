import { describe, expect, it } from 'vitest'
import { selectRecentTrackedBattleSummary } from './guild-profile-activity'
import type { RecentTrackedBattleRow } from './guild-profile-activity'

const baseRow = {
  battle_record_id: 'battle-1',
  started_at: '2026-06-01T10:00:00.000Z',
  outcome: 'win',
  home_kills: 0,
  home_deaths: 0,
  home_team_size: 20,
  main_opponent_team_size: 20,
  primary_opponent_name: 'Enemy',
  size_category: 'middle',
} satisfies RecentTrackedBattleRow

describe('selectRecentTrackedBattleSummary', () => {
  it('bundles split battle rows before selecting the recent public profile battle', () => {
    const rows: RecentTrackedBattleRow[] = [
      {
        ...baseRow,
        outcome: 'loss',
        home_kills: 2,
        home_deaths: 1,
        main_opponent_team_size: 10,
        primary_opponent_name: 'Small Force',
      },
      {
        ...baseRow,
        outcome: 'win',
        home_kills: 3,
        home_deaths: 4,
        main_opponent_team_size: 30,
        primary_opponent_name: 'Main Force',
      },
    ]

    expect(selectRecentTrackedBattleSummary(rows, true)).toEqual({
      startedAt: '2026-06-01T10:00:00.000Z',
      outcome: 'win',
      homeKills: 5,
      homeDeaths: 5,
      homeTeamSize: 20,
      primaryOpponentName: 'Main Force',
      sizeCategory: 'middle',
    })
  })

  it('keeps row-level behavior when split battle bundling is disabled', () => {
    const rows: RecentTrackedBattleRow[] = [
      {
        ...baseRow,
        home_kills: 2,
        home_deaths: 1,
        main_opponent_team_size: 10,
        primary_opponent_name: 'Small Force',
      },
    ]

    expect(selectRecentTrackedBattleSummary(rows, false)).toEqual({
      startedAt: '2026-06-01T10:00:00.000Z',
      outcome: 'win',
      homeKills: 2,
      homeDeaths: 1,
      homeTeamSize: 20,
      primaryOpponentName: 'Small Force',
      sizeCategory: 'middle',
    })
  })
})
