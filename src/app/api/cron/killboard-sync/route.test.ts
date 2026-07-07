import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listActiveTenants: vi.fn(),
  syncKillboard: vi.fn(),
  withCronRun: vi.fn(),
  loadTenantCronSettings: vi.fn(),
  loadEventActivityByTenant: vi.fn(),
  shouldRunIdleCron: vi.fn(),
  areBattlelogFeaturesPaused: vi.fn(),
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

vi.mock('@/lib/cron-cost-control', () => ({
  IDLE_KILLBOARD_SYNC_INTERVAL_MS: 60 * 60 * 1000,
  loadTenantCronSettings: mocks.loadTenantCronSettings,
  loadEventActivityByTenant: mocks.loadEventActivityByTenant,
  shouldRunIdleCron: mocks.shouldRunIdleCron,
}))

vi.mock('@/lib/battlelog-pause', () => ({
  BATTLELOG_PAUSED_CRON_STATUS: 202,
  areBattlelogFeaturesPaused: mocks.areBattlelogFeaturesPaused,
  getBattlelogPausePayload: (area: string) => ({
    paused: true,
    feature: 'battlelog',
    area,
    reason: 'ui_ux_refresh',
    message: 'Battlelog features are temporarily paused while the UI/UX refresh is in progress.',
  }),
}))

import { GET } from './route'

describe('GET /api/cron/killboard-sync', () => {
  beforeEach(() => {
    vi.useRealTimers()
    mocks.listActiveTenants.mockReset()
    mocks.syncKillboard.mockReset()
    mocks.withCronRun.mockReset()
    mocks.loadTenantCronSettings.mockReset()
    mocks.loadTenantCronSettings.mockReturnValue(new Map())
    mocks.loadEventActivityByTenant.mockReset()
    mocks.loadEventActivityByTenant.mockReturnValue(new Set())
    mocks.shouldRunIdleCron.mockReset()
    mocks.shouldRunIdleCron.mockReturnValue({ run: true, reason: 'no-previous-run', ageMs: null })
    mocks.areBattlelogFeaturesPaused.mockReset()
    mocks.areBattlelogFeaturesPaused.mockReturnValue(true)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns a paused payload before loading tenants while battlelog is stopped', async () => {
    const db = { from: vi.fn() }
    mocks.withCronRun.mockImplementation(async (_request, _options, handler) =>
      handler({ db, runId: 'run-1' }),
    )

    const response = await GET(new Request('https://example.test/api/cron/killboard-sync'))

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toMatchObject({
      paused: true,
      feature: 'battlelog',
      area: 'killboard-sync',
      reason: 'ui_ux_refresh',
    })
    expect(mocks.listActiveTenants).not.toHaveBeenCalled()
    expect(mocks.syncKillboard).not.toHaveBeenCalled()
    expect(db.from).not.toHaveBeenCalled()
  })

  it('aborts the tenant sync signal when the per-tenant timeout wins', async () => {
    mocks.areBattlelogFeaturesPaused.mockReturnValue(false)
    vi.useFakeTimers()
    const db = { from: vi.fn() }
    let capturedSignal: AbortSignal | undefined
    mocks.withCronRun.mockImplementation(async (_request, _options, handler) =>
      handler({ db, runId: 'run-1' }),
    )
    mocks.listActiveTenants.mockReturnValue([{ id: 'tenant-1', slug: 'slow-tenant' }])
    mocks.syncKillboard.mockImplementation(async (_db, _tenantId, options) => {
      capturedSignal = options.signal
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
      })
    })

    const pending = GET(new Request('https://example.test/api/cron/killboard-sync'))
    await vi.advanceTimersByTimeAsync(0)

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
