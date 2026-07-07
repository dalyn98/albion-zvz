import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  withCronRun: vi.fn(),
  syncPublicBattlelog: vi.fn(),
  areAgmBattlesCollectionPaused: vi.fn(),
}))

vi.mock('@/lib/cron-run', () => ({
  withCronRun: mocks.withCronRun,
}))

vi.mock('@/lib/public-battlelog-sync', () => ({
  syncPublicBattlelog: mocks.syncPublicBattlelog,
}))

vi.mock('@/lib/agm-battles-collection-pause', () => ({
  AGM_BATTLES_COLLECTION_PAUSED_CRON_STATUS: 202,
  areAgmBattlesCollectionPaused: mocks.areAgmBattlesCollectionPaused,
  getAgmBattlesCollectionPausePayload: (area: string) => ({
    paused: true,
    feature: 'agm-battles-collection',
    area,
    reason: 'cost_control_no_active_users',
    message: 'AGM Battles public collection is paused to avoid unnecessary cost while there are no active users.',
  }),
}))

import { GET } from './route'

describe('GET /api/cron/public-battlelog', () => {
  beforeEach(() => {
    mocks.withCronRun.mockReset()
    mocks.syncPublicBattlelog.mockReset()
    mocks.areAgmBattlesCollectionPaused.mockReset()
    mocks.areAgmBattlesCollectionPaused.mockReturnValue(true)
    mocks.withCronRun.mockImplementation(async (_request, _options, handler) =>
      handler({ db: { from: vi.fn() }, runId: 'run-1' }),
    )
  })

  it('returns a paused payload without running public collection while AGM Battles collection is stopped', async () => {
    const response = await GET(new Request('https://example.test/api/cron/public-battlelog'))

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toMatchObject({
      paused: true,
      feature: 'agm-battles-collection',
      area: 'public-battlelog',
      reason: 'cost_control_no_active_users',
    })
    expect(mocks.syncPublicBattlelog).not.toHaveBeenCalled()
  })

  it('runs the public collection when the AGM Battles collection pause is disabled', async () => {
    mocks.areAgmBattlesCollectionPaused.mockReturnValue(false)
    mocks.syncPublicBattlelog.mockResolvedValue({ inserted: 3 })

    const response = await GET(new Request('https://example.test/api/cron/public-battlelog?pages=5'))

    expect(response.status).toBe(200)
    expect(mocks.syncPublicBattlelog).toHaveBeenCalledWith(expect.any(Object), { pages: 5 })
    await expect(response.json()).resolves.toEqual({ inserted: 3 })
  })
})
