import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  withCronRun: vi.fn(),
  cleanupResolvedRegearScreenshots: vi.fn(),
  expireOverdueCraftTasks: vi.fn(),
  expireMemberTradeOrders: vi.fn(),
  expireStaleCronRuns: vi.fn(),
  pruneCronRunHistory: vi.fn(),
}))

vi.mock('@/lib/cron-run', () => ({ withCronRun: mocks.withCronRun }))
vi.mock('@/lib/regear-screenshot-cleanup', () => ({
  cleanupResolvedRegearScreenshots: mocks.cleanupResolvedRegearScreenshots,
}))
vi.mock('@/lib/craft-tasks', () => ({
  expireOverdueCraftTasks: mocks.expireOverdueCraftTasks,
}))
vi.mock('@/lib/cron-maintenance', () => ({
  expireMemberTradeOrders: mocks.expireMemberTradeOrders,
  expireStaleCronRuns: mocks.expireStaleCronRuns,
  pruneCronRunHistory: mocks.pruneCronRunHistory,
}))

import { GET } from './route'

describe('GET /api/cron/daily-maintenance', () => {
  const db = { from: vi.fn(), rpc: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.withCronRun.mockImplementation(async (_request, options, handler) => {
      expect(options).toEqual({ jobName: 'daily-maintenance', leaseSeconds: 600 })
      return handler({ db, runId: 'run-1' })
    })
    mocks.cleanupResolvedRegearScreenshots.mockResolvedValue({ deleted: 2 })
    mocks.expireOverdueCraftTasks.mockResolvedValue(3)
    mocks.expireMemberTradeOrders.mockResolvedValue({ expired: 4 })
    mocks.expireStaleCronRuns.mockResolvedValue({ expired: 6 })
    mocks.pruneCronRunHistory.mockResolvedValue({ deleted: 5 })
  })

  it('runs maintenance tasks sequentially and reports their results', async () => {
    const response = await GET(
      new Request('https://example.test/api/cron/daily-maintenance'),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      tasks: {
        screenshots: { status: 'succeeded', result: { deleted: 2 } },
        craft: { status: 'succeeded', result: 3 },
        memberTrades: { status: 'succeeded', result: { expired: 4 } },
        staleCronRuns: { status: 'succeeded', result: { expired: 6 } },
        cronRuns: { status: 'succeeded', result: { deleted: 5 } },
      },
    })
  })

  it('continues later tasks and marks the run failed when one task fails', async () => {
    mocks.expireOverdueCraftTasks.mockRejectedValue(new Error('craft unavailable'))

    const response = await GET(
      new Request('https://example.test/api/cron/daily-maintenance'),
    )

    expect(response.status).toBe(500)
    expect(mocks.expireMemberTradeOrders).toHaveBeenCalledOnce()
    expect(mocks.expireStaleCronRuns).toHaveBeenCalledOnce()
    expect(mocks.pruneCronRunHistory).toHaveBeenCalledOnce()
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      tasks: { craft: { status: 'failed', error: 'craft unavailable' } },
    })
  })
})
