import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('react', () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))
vi.mock('./supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

import { loadAdminWorkQueueSnapshot } from './admin-work-queue-server'

describe('loadAdminWorkQueueSnapshot', () => {
  beforeEach(() => mocks.getAdminClient.mockReset())

  it('loads all queue counts and ages through one RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        queue_key: 'regear',
        pending_count: '2',
        oldest_created_at: '2026-08-01T00:00:00Z',
      }],
      error: null,
    }))
    mocks.getAdminClient.mockReturnValue({ rpc })

    const snapshot = await loadAdminWorkQueueSnapshot('guild-1')

    expect(snapshot.total).toBe(2)
    expect(snapshot.counts.regear).toBe(2)
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('admin_work_queue_snapshot', {
      p_guild_id: 'guild-1',
    })
  })

  it('fails closed instead of issuing divergent table fallbacks', async () => {
    mocks.getAdminClient.mockReturnValue({
      rpc: vi.fn(async () => ({
        data: null,
        error: { code: '42883', message: 'missing' },
      })),
    })

    await expect(loadAdminWorkQueueSnapshot('guild-1')).rejects.toThrow(
      'ADMIN_WORK_QUEUE_LOAD_FAILED:42883',
    )
  })
})
