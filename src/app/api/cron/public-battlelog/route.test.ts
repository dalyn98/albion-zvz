import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  withCronRun: vi.fn(),
  syncPublicBattlelog: vi.fn(),
}))

vi.mock('@/lib/cron-run', () => ({
  withCronRun: mocks.withCronRun,
}))

vi.mock('@/lib/public-battlelog-sync', () => ({
  syncPublicBattlelog: mocks.syncPublicBattlelog,
}))

vi.mock('@/lib/agm-battles-collection-pause', () => ({
  AGM_BATTLES_COLLECTION_PAUSED_CRON_STATUS: 202,
  shouldCollectAgmBattles: () => true,
  getAgmBattlesCollectionPausePayload: (area: string) => ({
    paused: true,
    feature: 'agm-battles-collection',
    area,
    reason: 'cost_control_no_active_users',
    message: 'AGM Battles public collection is paused by the operator kill switch.',
  }),
}))

import { GET } from './route'

describe('GET /api/cron/public-battlelog', () => {
  beforeEach(() => {
    mocks.withCronRun.mockReset()
    mocks.syncPublicBattlelog.mockReset()
    mocks.withCronRun.mockImplementation(async (_request, _options, handler) =>
      handler({ db: { from: vi.fn() }, runId: 'run-1' }),
    )
  })

  it('runs hot public collection without consulting tenant activity', async () => {
    mocks.syncPublicBattlelog.mockResolvedValue({ inserted: 3 })

    const response = await GET(new Request('https://example.test/api/cron/public-battlelog?pages=5'))

    expect(response.status).toBe(200)
    expect(mocks.withCronRun).toHaveBeenCalledWith(
      expect.any(Request),
      {
        jobName: 'public-battlelog',
        leaseSeconds: 360,
        lockName: 'battle-ingestion',
      },
      expect.any(Function),
    )
    expect(mocks.syncPublicBattlelog).toHaveBeenCalledWith(expect.any(Object), {
      pages: 5,
      backfillLimit: 1,
      refreshRollups: false,
    })
    await expect(response.json()).resolves.toEqual({ inserted: 3 })
  })
})
