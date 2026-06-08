import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  withCronRun: vi.fn(),
  syncSearchConsolePerformance: vi.fn(),
}))

vi.mock('@/lib/cron-run', () => ({
  withCronRun: mocks.withCronRun,
}))

vi.mock('@/lib/seo-search-console-sync', () => ({
  syncSearchConsolePerformance: mocks.syncSearchConsolePerformance,
}))

import { GET } from './route'

describe('GET /api/cron/search-console-sync', () => {
  beforeEach(() => {
    mocks.withCronRun.mockReset()
    mocks.syncSearchConsolePerformance.mockReset()
  })

  it('runs behind the shared cron gate and returns the sync summary', async () => {
    const db = { from: vi.fn() }
    mocks.withCronRun.mockImplementation(async (_request, options, handler) =>
      handler({ db, runId: 'run-1' }),
    )
    mocks.syncSearchConsolePerformance.mockResolvedValue({
      status: 'succeeded',
      startDate: '2026-05-09',
      endDate: '2026-06-05',
      pageRows: 12,
      queryRows: 34,
      inspectedUrls: 9,
    })

    const response = await GET(new Request('https://example.test/api/cron/search-console-sync'))

    expect(mocks.withCronRun).toHaveBeenCalledWith(
      expect.any(Request),
      { jobName: 'search-console-sync', leaseSeconds: 900 },
      expect.any(Function),
    )
    expect(mocks.syncSearchConsolePerformance).toHaveBeenCalledWith(db, {
      runId: 'run-1',
    })
    await expect(response.json()).resolves.toEqual({
      status: 'succeeded',
      startDate: '2026-05-09',
      endDate: '2026-06-05',
      pageRows: 12,
      queryRows: 34,
      inspectedUrls: 9,
    })
  })
})
