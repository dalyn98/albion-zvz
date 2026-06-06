import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { getMemberPendingRequestCounts } from './member-pending-counts'

describe('getMemberPendingRequestCounts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads member pending counts through one aggregate RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        regear: '1',
        exchange: '2',
        donation: '3',
      }],
      error: null,
    }))
    const from = vi.fn()

    await expect(getMemberPendingRequestCounts(
      { rpc, from } as never,
      'guild-1',
      'discord-1',
    )).resolves.toEqual({
      regear: 1,
      exchange: 2,
      donation: 3,
    })

    expect(rpc).toHaveBeenCalledWith('member_pending_request_counts', {
      p_guild_id: 'guild-1',
      p_discord_id: 'discord-1',
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('falls back to exact table counts if the aggregate RPC is unavailable', async () => {
    const countsByTable = new Map<string, number>([
      ['regear_requests', 1],
      ['exchange_requests', 2],
      ['donation_requests', 3],
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

    await expect(getMemberPendingRequestCounts(
      { rpc, from } as never,
      'guild-1',
      'discord-1',
    )).resolves.toEqual({
      regear: 1,
      exchange: 2,
      donation: 3,
    })

    expect(from).toHaveBeenCalledTimes(3)
  })
})
