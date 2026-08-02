import { describe, expect, it, vi } from 'vitest'
import {
  countMemberTradeOrdersForMember,
  countShopOrdersForMember,
} from './member-request-counts'

function countQuery(count: number) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    or: vi.fn(() => query),
    in: vi.fn(() => query),
    then: (resolve: (value: { count: number; error: null }) => void) =>
      Promise.resolve({ count, error: null }).then(resolve),
  }
  return query
}

describe('member request aggregate counts', () => {
  it('counts all and pending shop orders independently of timeline pagination', async () => {
    const total = countQuery(37)
    const pending = countQuery(6)
    const from = vi.fn()
      .mockReturnValueOnce(total)
      .mockReturnValueOnce(pending)
    const rpc = vi.fn().mockResolvedValue({ data: 'stable-member-1', error: null })

    await expect(countShopOrdersForMember({ from, rpc } as never, 'guild-1', 'member-1'))
      .resolves.toEqual({ total: 37, active: 6 })
    expect(rpc).toHaveBeenCalledWith('resolve_guild_member_id', {
      p_guild_id: 'guild-1',
      p_identity_type: 'discord',
      p_subject_id: 'member-1',
    })
    expect(total.eq).toHaveBeenCalledWith('guild_id', 'guild-1')
    expect(total.eq).toHaveBeenCalledWith('guild_member_id', 'stable-member-1')
    expect(pending.eq).toHaveBeenCalledWith('status', 'pending')
  })

  it('counts both buyer and seller active member-trade orders', async () => {
    const total = countQuery(245)
    const active = countQuery(11)
    const from = vi.fn()
      .mockReturnValueOnce(total)
      .mockReturnValueOnce(active)
    const rpc = vi.fn().mockResolvedValue({ data: 'stable-member-1', error: null })

    await expect(countMemberTradeOrdersForMember({ from, rpc } as never, 'guild-1', 'member-1'))
      .resolves.toEqual({ total: 245, active: 11 })
    expect(total.or).toHaveBeenCalledWith(
      'buyer_guild_member_id.eq.stable-member-1,seller_guild_member_id.eq.stable-member-1',
    )
    expect(active.in).toHaveBeenCalledWith('status', [
      'awaiting_delivery',
      'delivered',
      'disputed',
    ])
  })
})
