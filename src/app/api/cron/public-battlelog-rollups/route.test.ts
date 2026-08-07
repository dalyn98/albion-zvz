import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  withCronRun: vi.fn(),
  refreshPublicBattlelogRollups: vi.fn(),
}))

vi.mock('@/lib/cron-run', () => ({ withCronRun: mocks.withCronRun }))
vi.mock('@/lib/public-battlelog-sync', () => ({
  refreshPublicBattlelogRollups: mocks.refreshPublicBattlelogRollups,
}))
vi.mock('@/lib/agm-battles-collection-pause', () => ({
  AGM_BATTLES_COLLECTION_PAUSED_CRON_STATUS: 202,
  shouldCollectAgmBattles: () => true,
  getAgmBattlesCollectionPausePayload: (area: string) => ({ area }),
}))

import { GET } from './route'

describe('GET /api/cron/public-battlelog-rollups', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.withCronRun.mockImplementation(async (_request, options, handler) => {
      expect(options).toEqual({
        jobName: 'public-battlelog-rollups',
        leaseSeconds: 360,
        lockName: 'battle-ingestion',
      })
      return handler({ db: { rpc: vi.fn() }, runId: 'run-1' })
    })
  })

  it('refreshes rankings without fetching or backfilling battles', async () => {
    mocks.refreshPublicBattlelogRollups.mockResolvedValue({ rollups: [{ rows: 3 }] })

    const response = await GET(
      new Request('https://example.test/api/cron/public-battlelog-rollups'),
    )

    expect(response.status).toBe(200)
    expect(mocks.refreshPublicBattlelogRollups).toHaveBeenCalledOnce()
    await expect(response.json()).resolves.toEqual({ rollups: [{ rows: 3 }] })
  })
})
