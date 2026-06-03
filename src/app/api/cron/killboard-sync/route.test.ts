import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listActiveTenants: vi.fn(),
  syncKillboard: vi.fn(),
  withCronRun: vi.fn(),
}))

vi.mock('@/lib/tenant', () => ({
  listActiveTenants: mocks.listActiveTenants,
}))

vi.mock('@/lib/killboard-sync', () => ({
  syncKillboard: mocks.syncKillboard,
}))

vi.mock('@/lib/cron-run', () => ({
  withCronRun: mocks.withCronRun,
}))

import { GET } from './route'

describe('GET /api/cron/killboard-sync', () => {
  beforeEach(() => {
    vi.useRealTimers()
    mocks.listActiveTenants.mockReset()
    mocks.syncKillboard.mockReset()
    mocks.withCronRun.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('aborts the tenant sync signal when the per-tenant timeout wins', async () => {
    vi.useFakeTimers()
    const db = { from: vi.fn() }
    let capturedSignal: AbortSignal | undefined
    mocks.withCronRun.mockImplementation(async (_request, _options, handler) =>
      handler({ db, runId: 'run-1' }),
    )
    mocks.listActiveTenants.mockResolvedValue([{ id: 'tenant-1', slug: 'slow-tenant' }])
    mocks.syncKillboard.mockImplementation(async (_db, _tenantId, options) => {
      capturedSignal = options.signal
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
      })
    })

    const pending = GET(new Request('https://example.test/api/cron/killboard-sync'))
    await Promise.resolve()
    await Promise.resolve()

    expect(capturedSignal).toBeDefined()
    await vi.advanceTimersByTimeAsync(90_000)
    const response = await pending

    expect(capturedSignal?.aborted).toBe(true)
    expect(mocks.syncKillboard).toHaveBeenCalledWith(db, 'tenant-1', {
      signal: capturedSignal,
    })
    expect(db.from).not.toHaveBeenCalled()
    await expect(response.json()).resolves.toMatchObject({
      tenants: [
        {
          tenant: 'slow-tenant',
          error: 'per-tenant timeout (90000ms): slow-tenant',
        },
      ],
      skipped: [],
    })
  })
})
