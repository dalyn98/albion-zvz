import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
}))

vi.mock('react', () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

vi.mock('./supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

import { getAdminBadgeCounts } from './admin-badges'

describe('getAdminBadgeCounts', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
  })

  it('loads sidebar pending counts through one aggregate RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        regear: '1',
        exchange: '2',
        donation: '3',
        shop: '4',
        member_trade: '5',
        event_payout: '6',
        craft: '7',
      }],
      error: null,
    }))
    const from = vi.fn()
    mocks.getAdminClient.mockReturnValue({ rpc, from })

    await expect(getAdminBadgeCounts('guild-1')).resolves.toEqual({
      regear: 1,
      exchange: 2,
      donation: 3,
      shop: 4,
      memberTrade: 5,
      eventPayout: 6,
      craft: 7,
    })

    expect(rpc).toHaveBeenCalledWith('admin_pending_badge_counts', {
      p_guild_id: 'guild-1',
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('falls back to exact table counts if the aggregate RPC is unavailable', async () => {
    const countsByTable = new Map<string, number>([
      ['regear_requests', 1],
      ['exchange_requests', 2],
      ['donation_requests', 3],
      ['shop_orders', 4],
      ['member_trade_orders', 5],
      ['event_payout_requests', 6],
      ['craft_tasks', 7],
    ])
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'not found' } }))
    const from = vi.fn((table: string) => {
      const result = { count: countsByTable.get(table) ?? 0 }
      const query = {
        select: () => query,
        eq: () => query,
        then: (resolve: (value: typeof result) => void) => resolve(result),
      }
      return query
    })
    mocks.getAdminClient.mockReturnValue({ rpc, from })

    await expect(getAdminBadgeCounts('guild-1')).resolves.toEqual({
      regear: 1,
      exchange: 2,
      donation: 3,
      shop: 4,
      memberTrade: 5,
      eventPayout: 6,
      craft: 7,
    })

    expect(from).toHaveBeenCalledTimes(7)
  })
})
