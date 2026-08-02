import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { loadMemberWorkInboxSnapshot } from './member-work-inbox-server'

describe('loadMemberWorkInboxSnapshot', () => {
  beforeEach(() => vi.clearAllMocks())

  it('loads one bounded source snapshot for the active guild and member', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        item_key: 'shop:1',
        domain: 'shop',
        source_id: 'shop-1',
        bucket: 'action_required',
        stage: 'shop_price_confirmation',
        status: 'pending',
        title: 'Broadsword',
        amount: 12000,
        unit: 'points',
        created_at: '2026-08-01T00:00:00Z',
        updated_at: '2026-08-01T01:00:00Z',
        due_at: null,
        href: '/shop?order=shop-1#shop-order-shop-1',
        next_actor: 'member',
        metadata: { itemCount: 1 },
      }],
      error: null,
    }))

    const snapshot = await loadMemberWorkInboxSnapshot(
      { rpc } as never,
      'guild-1',
      'discord-1',
      { includeHistory: false, historyLimit: 999 },
    )

    expect(snapshot.available).toBe(true)
    expect(snapshot.actionRequiredCount).toBe(1)
    expect(rpc).toHaveBeenCalledWith('member_work_inbox_snapshot', {
      p_guild_id: 'guild-1',
      p_discord_id: 'discord-1',
      p_include_history: false,
      p_history_limit: 200,
    })
  })

  it('fails closed without inventing work when the read model is unavailable', async () => {
    const snapshot = await loadMemberWorkInboxSnapshot(
      { rpc: vi.fn(async () => ({ data: null, error: { message: 'missing' } })) } as never,
      'guild-1',
      'discord-1',
    )
    expect(snapshot.available).toBe(false)
    expect(snapshot.activeCount).toBe(0)
  })
})
