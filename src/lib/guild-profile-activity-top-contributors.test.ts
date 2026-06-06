import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  getAppSetting: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/app-settings', () => ({
  getAppSetting: mocks.getAppSetting,
}))

vi.mock('@/lib/timezone', () => ({
  getCurrentWeekStartIso: () => '2026-06-01T00:00:00.000Z',
}))

import { loadTopContributorsThisWeek } from './guild-profile-activity'

describe('loadTopContributorsThisWeek', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
    mocks.getAppSetting.mockReset()
    mocks.getAppSetting.mockResolvedValue('false')
  })

  it('uses the SQL leaderboard rollup RPC instead of direct killboard scans when available', async () => {
    const avatarsQuery = {
      select: vi.fn(() => avatarsQuery),
      eq: vi.fn(() => avatarsQuery),
      is: vi.fn(() => avatarsQuery),
      not: vi.fn(() => avatarsQuery),
      order: vi.fn(() => avatarsQuery),
      then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
        Promise.resolve({
          data: [
            {
              discord_id: 'discord-1',
              username: 'Alpha',
              avatar: 'avatar-1',
              albion_player_id: 'player-1',
            },
            {
              discord_id: 'discord-2',
              username: 'Bravo',
              avatar: null,
              albion_player_id: 'player-2',
            },
          ],
          error: null,
        }).then(resolve, reject),
    }
    const from = vi.fn((table: string) => {
      if (table !== 'guild_avatars') throw new Error(`unexpected direct table scan: ${table}`)
      return avatarsQuery
    })
    const range = vi.fn(async () => ({
      data: [
        {
          albion_player_id: 'player-1',
          kills: '2',
          deaths: '0',
          participations: '3',
          death_battles: '0',
          wins: '2',
          losses: '1',
        },
        {
          albion_player_id: 'player-2',
          kills: '5',
          deaths: '1',
          participations: '4',
          death_battles: '1',
          wins: '3',
          losses: '1',
        },
      ],
      error: null,
    }))
    const rpc = vi.fn(() => ({ range }))
    mocks.getAdminClient.mockReturnValue({ from, rpc })

    const rows = await loadTopContributorsThisWeek('guild-1', 1)

    expect(rpc).toHaveBeenCalledWith('member_leaderboard_rollups', {
      p_guild_id: 'guild-1',
      p_since: '2026-06-01T00:00:00.000Z',
      p_bundle_splits: false,
    })
    expect(range).toHaveBeenCalledWith(0, 999)
    expect(rows).toEqual([
      expect.objectContaining({
        albionPlayerId: 'player-2',
        discordId: 'discord-2',
        name: 'Bravo',
        kills: 5,
      }),
    ])
  })
})
