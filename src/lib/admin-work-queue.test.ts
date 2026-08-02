import { describe, expect, it } from 'vitest'
import {
  ADMIN_WORK_QUEUE_KEYS,
  buildAdminWorkQueueSnapshot,
  getAdminWorkQueueHref,
} from './admin-work-queue'

describe('admin work queue snapshot', () => {
  it('normalizes one stable row per known queue and totals the same counts', () => {
    const snapshot = buildAdminWorkQueueSnapshot([
      {
        queue_key: 'shop',
        pending_count: '3',
        oldest_created_at: '2026-08-01T01:00:00.000Z',
      },
      {
        queue_key: 'regear',
        pending_count: 2,
        oldest_created_at: 'invalid',
      },
      { queue_key: 'unknown', pending_count: 99 },
      { queue_key: 'shop', pending_count: 50 },
    ])

    expect(snapshot.items.map((item) => item.key)).toEqual(ADMIN_WORK_QUEUE_KEYS)
    expect(snapshot.counts.shop).toBe(3)
    expect(snapshot.counts.regear).toBe(2)
    expect(snapshot.items.find((item) => item.key === 'regear')?.oldestCreatedAt).toBeNull()
    expect(snapshot.items.find((item) => item.key === 'shop')?.href).toBe(
      '/admin/dashboard/approvals?tab=shop',
    )
    expect(snapshot.total).toBe(5)
  })

  it('fails closed for malformed counts and centralizes deep links', () => {
    const snapshot = buildAdminWorkQueueSnapshot([
      { queue_key: 'exchange', pending_count: -1 },
      { queue_key: 'donation', pending_count: Number.POSITIVE_INFINITY },
    ])

    expect(snapshot.total).toBe(0)
    expect(getAdminWorkQueueHref('memberTrade')).toContain('tab=member_trade')
  })
})
