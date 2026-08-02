import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  loadAdminWorkQueueSnapshot: vi.fn(),
}))

vi.mock('react', () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

vi.mock('./admin-work-queue-server', () => ({
  loadAdminWorkQueueSnapshot: mocks.loadAdminWorkQueueSnapshot,
}))

import { getAdminBadgeCounts } from './admin-badges'

describe('getAdminBadgeCounts', () => {
  beforeEach(() => {
    mocks.loadAdminWorkQueueSnapshot.mockReset()
  })

  it('projects sidebar counts from the shared operator snapshot', async () => {
    mocks.loadAdminWorkQueueSnapshot.mockResolvedValue({
      items: [],
      total: 28,
      counts: {
        regear: 1,
        exchange: 2,
        donation: 3,
        shop: 4,
        memberTrade: 5,
        eventPayout: 6,
        craft: 7,
      },
    })

    await expect(getAdminBadgeCounts('guild-1')).resolves.toEqual({
      regear: 1,
      exchange: 2,
      donation: 3,
      shop: 4,
      memberTrade: 5,
      eventPayout: 6,
      craft: 7,
    })

    expect(mocks.loadAdminWorkQueueSnapshot).toHaveBeenCalledWith('guild-1')
  })
})
