import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  withCronRun: vi.fn(),
  startDuePublishedEvents: vi.fn(),
}))

vi.mock('@/lib/cron-run', () => ({ withCronRun: mocks.withCronRun }))
vi.mock('@/lib/event-auto-start', () => ({
  startDuePublishedEvents: mocks.startDuePublishedEvents,
}))

import { GET } from './route'

describe('GET /api/cron/event-auto-start', () => {
  const db = { from: vi.fn(), rpc: vi.fn() }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.withCronRun.mockImplementation(async (_request, options, handler) => {
      expect(options).toEqual({ jobName: 'event-auto-start', leaseSeconds: 180 })
      return handler({ db, runId: 'run-1' })
    })
  })

  it('returns success when every due event starts', async () => {
    mocks.startDuePublishedEvents.mockResolvedValue({
      scanned: 1,
      started: [{
        event_id: 'event-1',
        guild_id: 'guild-1',
        battle_started_at: '2026-08-24T12:30:00.000Z',
      }],
      failures: [],
    })

    const response = await GET(new Request('https://example.test/api/cron/event-auto-start'))

    expect(response.status).toBe(200)
    expect(mocks.startDuePublishedEvents).toHaveBeenCalledWith({ db })
  })

  it('returns 500 so cron_runs records a per-event failure', async () => {
    mocks.startDuePublishedEvents.mockResolvedValue({
      scanned: 1,
      started: [],
      failures: [{
        event_id: 'event-1',
        guild_id: 'guild-1',
        error: 'event_regear_roster_changed',
      }],
    })

    const response = await GET(new Request('https://example.test/api/cron/event-auto-start'))

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      failures: [{ event_id: 'event-1' }],
    })
  })
})
