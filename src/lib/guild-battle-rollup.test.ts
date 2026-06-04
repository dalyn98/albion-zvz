import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadGuildBattleRollup } from './guild-battle-rollup'

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

describe('loadGuildBattleRollup', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
    mocks.getAppSetting.mockReset()
    mocks.getAppSetting.mockResolvedValue('false')
  })

  it('uses the SQL aggregate RPC when available', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        battle_count: '2',
        win_count: '1',
        loss_count: '1',
        tie_count: '0',
        total_kills: '15',
        total_deaths: '9',
      }],
      error: null,
    }))
    mocks.getAdminClient.mockReturnValue({ rpc })

    await expect(loadGuildBattleRollup('guild-1', '2026-06-01T00:00:00.000Z')).resolves.toEqual({
      battleCount: 2,
      winCount: 1,
      lossCount: 1,
      tieCount: 0,
      totalKills: 15,
      totalDeaths: 9,
    })
    expect(rpc).toHaveBeenCalledWith('guild_battle_rollup', {
      p_guild_id: 'guild-1',
      p_since: '2026-06-01T00:00:00.000Z',
      p_bundle_splits: false,
    })
  })

  it('falls back to paged tenant_battle_records aggregation before the RPC is deployed', async () => {
    const rows = [
      {
        battle_record_id: 'battle-1',
        outcome: 'win',
        home_kills: 10,
        home_deaths: 2,
        home_team_size: 20,
        main_opponent_team_size: 20,
      },
      {
        battle_record_id: 'battle-2',
        outcome: 'loss',
        home_kills: 1,
        home_deaths: 0,
        home_team_size: 50,
        main_opponent_team_size: 10,
      },
    ]
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      gte: vi.fn(() => query),
      order: vi.fn(() => query),
      range: vi.fn(async (from: number, to: number) => ({
        data: rows.slice(from, to + 1),
        error: null,
      })),
    }
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: 'PGRST202', message: 'rpc not deployed' },
    }))
    mocks.getAdminClient.mockReturnValue({
      rpc,
      from: vi.fn(() => query),
    })

    await expect(loadGuildBattleRollup('guild-1')).resolves.toEqual({
      battleCount: 1,
      winCount: 1,
      lossCount: 0,
      tieCount: 0,
      totalKills: 10,
      totalDeaths: 2,
    })
  })
})
