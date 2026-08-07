import { describe, expect, it, vi } from 'vitest'
import { refreshPublicBattlelogRollups } from '@/lib/public-battlelog-sync'

describe('refreshPublicBattlelogRollups', () => {
  it('refreshes current and previous week before both season snapshots', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { week: 'current' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'previous failed' } })
      .mockResolvedValueOnce({ data: { guilds: 2 }, error: null })
      .mockResolvedValueOnce({ data: { publicGuilds: 5 }, error: null })

    await expect(
      refreshPublicBattlelogRollups(
        { rpc } as never,
        { now: new Date('2026-08-07T00:00:00.000Z') },
      ),
    ).resolves.toEqual({
      rollups: [
        { week: 'current' },
        { week_start: '2026-07-27', error: 'previous failed' },
      ],
      season_rollups: { guilds: 2 },
      season_rollups_v2: { publicGuilds: 5 },
    })
    expect(rpc.mock.calls).toEqual([
      ['refresh_guild_weekly_zvz_rollups', { p_week_start: '2026-08-03' }],
      ['refresh_guild_weekly_zvz_rollups', { p_week_start: '2026-07-27' }],
      ['refresh_current_guild_zvz_season_snapshots'],
      ['refresh_current_public_zvz_v2_season_snapshots'],
    ])
  })

  it('can refresh only the public season snapshot for backfill compatibility', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { publicGuilds: 5 }, error: null })

    await expect(
      refreshPublicBattlelogRollups(
        { rpc } as never,
        { includeGuildRollups: false },
      ),
    ).resolves.toEqual({
      rollups: [],
      season_rollups: null,
      season_rollups_v2: { publicGuilds: 5 },
    })
    expect(rpc).toHaveBeenCalledOnce()
    expect(rpc).toHaveBeenCalledWith(
      'refresh_current_public_zvz_v2_season_snapshots',
    )
  })
})
