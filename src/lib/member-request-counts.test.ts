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

    await expect(countShopOrdersForMember({ from } as never, 'guild-1', 'member-1'))
      .resolves.toEqual({ total: 37, active: 6 })
    expect(total.eq).toHaveBeenCalledWith('guild_id', 'guild-1')
    expect(total.eq).toHaveBeenCalledWith('discord_id', 'member-1')
    expect(pending.eq).toHaveBeenCalledWith('status', 'pending')
  })

  it('counts both buyer and seller active member-trade orders', async () => {
    const total = countQuery(245)
    const active = countQuery(11)
    const from = vi.fn()
      .mockReturnValueOnce(total)
      .mockReturnValueOnce(active)

    await expect(countMemberTradeOrdersForMember({ from } as never, 'guild-1', 'member-1'))
      .resolves.toEqual({ total: 245, active: 11 })
    expect(total.or).toHaveBeenCalledWith(
      'buyer_discord_id.eq.member-1,seller_discord_id.eq.member-1',
    )
    expect(active.in).toHaveBeenCalledWith('status', [
      'awaiting_delivery',
      'delivered',
      'disputed',
    ])
  })
})
