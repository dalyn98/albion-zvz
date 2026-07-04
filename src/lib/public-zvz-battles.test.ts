import { describe, expect, it, vi } from 'vitest'
import {
  classifyPublicBattleFromForces,
  loadPublicZvzBoardData,
  normalizePublicZvzMinPlayers,
  normalizePublicZvzServerFilter,
  type PublicRecentBattle,
  type PublicWeeklyZvzRankingResult,
} from './public-zvz-battles'
import { getUtcWeekStartDateString } from './public-battlelog-sync'

vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
}))

vi.mock('server-only', () => ({}))

describe('public ZvZ battles helpers', () => {
  it('normalizes public board filters conservatively', () => {
    expect(normalizePublicZvzServerFilter('east')).toBe('east')
    expect(normalizePublicZvzServerFilter('banana')).toBeNull()
    expect(normalizePublicZvzMinPlayers('10')).toBe(10)
    expect(normalizePublicZvzMinPlayers('18')).toBe(18)
    expect(normalizePublicZvzMinPlayers('21')).toBe(21)
    expect(normalizePublicZvzMinPlayers('42')).toBe(42)
    expect(normalizePublicZvzMinPlayers('09')).toBe(10)
    expect(normalizePublicZvzMinPlayers('1000')).toBe(999)
    expect(normalizePublicZvzMinPlayers('banana')).toBe(21)
  })

  it('uses Monday UTC as the weekly ranking boundary', () => {
    expect(getUtcWeekStartDateString(new Date('2026-07-01T12:00:00Z'))).toBe(
      '2026-06-29',
    )
    expect(getUtcWeekStartDateString(new Date('2026-07-05T23:59:59Z'))).toBe(
      '2026-06-29',
    )
    expect(getUtcWeekStartDateString(new Date('2026-07-06T00:00:00Z'))).toBe(
      '2026-07-06',
    )
  })

  it('classifies disarray-scale mutual fights as ZvZ', () => {
    const result = classifyPublicBattleFromForces({
      startedAt: '2026-07-01T12:00:00Z',
      endedAt: '2026-07-01T12:08:00Z',
      allianceForces: [
        { team_size: 47, kills: 18, deaths: 14 },
        { team_size: 42, kills: 14, deaths: 18 },
      ],
    })

    expect(result).toEqual({
      kind: 'zvz',
      reason: 'disarray_scale_mutual_or_sustained',
    })
  })

  it('does not classify a short one-sided catch as ZvZ', () => {
    const result = classifyPublicBattleFromForces({
      startedAt: '2026-07-01T12:00:00Z',
      endedAt: '2026-07-01T12:01:10Z',
      allianceForces: [
        { team_size: 35, kills: 4, deaths: 0 },
        { team_size: 25, kills: 0, deaths: 4 },
      ],
    })

    expect(result.kind).not.toBe('zvz')
    expect(result.reason).toBe('disarray_scale_short_one_sided')
  })

  it('keeps the public board partially usable when one data source fails', async () => {
    const recentBattle: PublicRecentBattle = {
      id: 'battle-record-1',
      server: 'east',
      albionBattleId: 123456789,
      startedAt: '2026-07-01T12:00:00.000Z',
      endedAt: '2026-07-01T12:12:00.000Z',
      totalPlayers: 84,
      totalKills: 31,
      totalFame: 12_000_000,
      clusterName: 'Basin of Life',
      activityKind: 'zvz',
      activityReason: 'disarray_scale_mutual_or_sustained',
      topForces: [],
      topGuilds: [],
    }

    const result = await loadPublicZvzBoardData(
      {
        server: 'east',
        minPlayers: 42,
        rankingLimit: 20,
        now: new Date('2026-07-05T12:00:00.000Z'),
      },
      {
        loadRankings: async () => {
          throw new Error('rankings unavailable')
        },
        loadRecentBattles: async () => [recentBattle],
      },
    )

    expect(result.rankingError).toBe(true)
    expect(result.recentError).toBe(false)
    expect(result.rankingResult).toEqual({
      weekStart: '2026-06-29',
      isCurrentWeek: true,
      rankings: [],
    } satisfies PublicWeeklyZvzRankingResult)
    expect(result.recentBattles).toEqual([recentBattle])
  })
})
