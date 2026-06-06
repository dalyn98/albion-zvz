import { describe, expect, it, vi } from 'vitest'
import { fetchMemberLeaderboardRollups } from './member-leaderboard-rollups'

describe('fetchMemberLeaderboardRollups', () => {
  it('pages RPC results so large guild rankings are not truncated', async () => {
    const range = vi
      .fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, (_, i) => ({
          albion_player_id: `player-${i}`,
          kills: i,
          deaths: 0,
          participations: 1,
          death_battles: 0,
          wins: 1,
          losses: 0,
        })),
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{
          albion_player_id: 'player-1000',
          kills: 1000,
          deaths: 0,
          participations: 1,
          death_battles: 0,
          wins: 1,
          losses: 0,
        }],
        error: null,
      })
    const rpc = vi.fn(() => ({ range }))

    const rows = await fetchMemberLeaderboardRollups(
      { rpc } as unknown as Parameters<typeof fetchMemberLeaderboardRollups>[0],
      'guild-1',
      '2026-06-01T00:00:00.000Z',
      false,
    )

    expect(rows).toHaveLength(1001)
    expect(range).toHaveBeenNthCalledWith(1, 0, 999)
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999)
    expect(rpc).toHaveBeenCalledWith('member_leaderboard_rollups', {
      p_guild_id: 'guild-1',
      p_since: '2026-06-01T00:00:00.000Z',
      p_bundle_splits: false,
    })
  })
})
