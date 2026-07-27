import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  withCronRun: vi.fn(),
  syncPublicBattlelog: vi.fn(),
  listActiveTenants: vi.fn(),
}))

vi.mock('@/lib/cron-run', () => ({
  withCronRun: mocks.withCronRun,
}))

vi.mock('@/lib/public-battlelog-sync', () => ({
  syncPublicBattlelog: mocks.syncPublicBattlelog,
}))

vi.mock('@/lib/tenant', () => ({
  listActiveTenants: mocks.listActiveTenants,
}))

vi.mock('@/lib/agm-battles-collection-pause', () => ({
  AGM_BATTLES_COLLECTION_PAUSED_CRON_STATUS: 202,
  shouldCollectAgmBattles: (activeTenantCount: number) => activeTenantCount > 0,
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
    mocks.listActiveTenants.mockReset()
    mocks.listActiveTenants.mockResolvedValue([])
    mocks.withCronRun.mockImplementation(async (_request, _options, handler) =>
      handler({ db: { from: vi.fn() }, runId: 'run-1' }),
    )
  })

  it('returns a cost-control payload without collecting when there are no active tenants', async () => {
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

  it('runs the public collection when at least one tenant is active', async () => {
    mocks.listActiveTenants.mockResolvedValue([{ id: 'tenant-1' }])
    mocks.syncPublicBattlelog.mockResolvedValue({ inserted: 3 })

    const response = await GET(new Request('https://example.test/api/cron/public-battlelog?pages=5'))

    expect(response.status).toBe(200)
    expect(mocks.listActiveTenants).toHaveBeenCalledOnce()
    expect(mocks.syncPublicBattlelog).toHaveBeenCalledWith(expect.any(Object), { pages: 5 })
    await expect(response.json()).resolves.toEqual({ inserted: 3 })
  })
})
