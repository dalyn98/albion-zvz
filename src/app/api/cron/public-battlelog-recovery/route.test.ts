import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  withCronRun: vi.fn(),
  syncPublicBattlelog: vi.fn(),
}))

vi.mock('@/lib/cron-run', () => ({ withCronRun: mocks.withCronRun }))
vi.mock('@/lib/public-battlelog-sync', () => ({
  syncPublicBattlelog: mocks.syncPublicBattlelog,
}))
vi.mock('@/lib/agm-battles-collection-pause', () => ({
  AGM_BATTLES_COLLECTION_PAUSED_CRON_STATUS: 202,
  shouldCollectAgmBattles: () => true,
  getAgmBattlesCollectionPausePayload: (area: string) => ({ area }),
}))

import { GET } from './route'

describe('GET /api/cron/public-battlelog-recovery', () => {
  beforeEach(() => {
    mocks.withCronRun.mockReset()
    mocks.syncPublicBattlelog.mockReset()
    mocks.withCronRun.mockImplementation(async (_request, options, handler) => {
      expect(options).toEqual({
        jobName: 'public-battlelog-recovery',
        leaseSeconds: 360,
        lockName: 'battle-ingestion',
      })
      return handler({ db: { rpc: vi.fn() }, runId: 'run-1' })
    })
  })

  it('runs the deeper scan without coupling it to ranking refreshes', async () => {
    mocks.syncPublicBattlelog.mockResolvedValue({ refreshed: true })
    const response = await GET(
      new Request('https://example.test/api/cron/public-battlelog-recovery'),
    )

    expect(response.status).toBe(200)
    expect(mocks.syncPublicBattlelog).toHaveBeenCalledWith(expect.any(Object), {
      pages: 3,
      backfillLimit: 10,
      refreshRollups: false,
    })
    await expect(response.json()).resolves.toEqual({ refreshed: true })
  })
})
