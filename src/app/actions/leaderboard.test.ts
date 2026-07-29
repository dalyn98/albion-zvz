import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  getAdminClient: vi.fn(),
  getAppSetting: vi.fn(),
}))

vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
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

import { getLeaderboard } from './leaderboard'

describe('getLeaderboard', () => {
  beforeEach(() => {
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.getAdminClient.mockReset()
    mocks.getAppSetting.mockReset()

    mocks.getSession.mockResolvedValue({ discordId: 'user-1' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAppSetting.mockResolvedValue('false')
  })

  it('builds leaderboard cards from the SQL aggregate RPC when available', async () => {
    const avatarsQuery = {
      select: vi.fn(() => avatarsQuery),
      eq: vi.fn(() => avatarsQuery),
      is: vi.fn(() => avatarsQuery),
      not: vi.fn(() => avatarsQuery),
      then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) =>
        Promise.resolve({
          data: [{
            discord_id: 'discord-1',
            username: 'Alpha',
            avatar: 'avatar-hash',
            albion_player_id: 'player-1',
          }],
          error: null,
        }).then(resolve, reject),
    }
    const from = vi.fn((table: string) => {
      if (table !== 'guild_avatars') throw new Error(`unexpected table: ${table}`)
      return avatarsQuery
    })
    const range = vi.fn(async () => ({
      data: [{
        albion_player_id: 'player-1',
        kills: '10',
        deaths: '1',
        participations: '5',
        death_battles: '1',
        wins: '3',
        losses: '2',
      }],
      error: null,
    }))
    const rpc = vi.fn(() => ({ range }))
    mocks.getAdminClient.mockReturnValue({ from, rpc })

    const data = await getLeaderboard('week')

    expect(data?.kills[0]).toMatchObject({
      albion_player_id: 'player-1',
      username: 'Alpha',
      value: 10,
      kills: 10,
      deaths: 1,
    })
    expect(data?.participation[0]?.value).toBe(5)
    expect(data?.survival[0]?.value).toBe(80)
    expect(data?.kd[0]?.value).toBe(10)
    expect(data?.winRate[0]?.value).toBe(60)
    expect(data).toMatchObject({
      populationSize: 1,
      windowStart: '2026-06-01T00:00:00.000Z',
      topLimit: 10,
      minimumSamples: {
        kills: 1,
        participation: 1,
        survival: 5,
        kd: 5,
        winRate: 5,
      },
    })
    expect(rpc).toHaveBeenCalledWith('member_leaderboard_rollups', {
      p_guild_id: 'guild-1',
      p_since: '2026-06-01T00:00:00.000Z',
      p_bundle_splits: false,
    })
    expect(range).toHaveBeenCalledWith(0, 999)
  })
})
