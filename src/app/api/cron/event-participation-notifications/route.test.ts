import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  withCronRun: vi.fn(),
  processOutbox: vi.fn(),
  processDomainOutbox: vi.fn(),
}))

vi.mock('@/lib/cron-run', () => ({
  withCronRun: mocks.withCronRun,
}))

vi.mock('@/lib/event-participation-closeout-server', () => ({
  processEventParticipationNotificationOutbox: mocks.processOutbox,
}))

vi.mock('@/lib/domain-outbox-delivery', () => ({
  processDomainOutbox: mocks.processDomainOutbox,
}))

import { GET } from './route'

describe('event participation notification cron', () => {
  beforeEach(() => {
    mocks.withCronRun.mockReset()
    mocks.processOutbox.mockReset()
    mocks.processDomainOutbox.mockReset()
    mocks.withCronRun.mockImplementation(
      async (
        _request: Request,
        _options: unknown,
        handler: () => Promise<Response>,
      ) => handler(),
    )
  })

  it('uses the shared cron lease and drains a bounded outbox batch', async () => {
    mocks.processOutbox.mockResolvedValue({
      claimed: 2,
      sent: 1,
      skipped: 1,
      failed: 0,
    })
    mocks.processDomainOutbox.mockResolvedValue({
      claimed: 3,
      sent: 2,
      cancelled: 1,
      failed: 0,
    })
    const request = new Request(
      'http://localhost/api/cron/event-participation-notifications',
    )

    const response = await GET(request)

    expect(mocks.withCronRun).toHaveBeenCalledWith(
      request,
      {
        jobName: 'event-participation-notifications',
        leaseSeconds: 300,
      },
      expect.any(Function),
    )
    expect(mocks.processOutbox).toHaveBeenCalledWith({ limit: 100 })
    expect(mocks.processDomainOutbox).toHaveBeenCalledWith({ limit: 100 })
    await expect(response.json()).resolves.toEqual({
      participation: {
        claimed: 2,
        sent: 1,
        skipped: 1,
        failed: 0,
      },
      domain: {
        claimed: 3,
        sent: 2,
        cancelled: 1,
        failed: 0,
      },
    })
  })

  it('reports a processor failure without bypassing cron completion tracking', async () => {
    mocks.processOutbox.mockRejectedValue(new Error('claim failed'))
    mocks.processDomainOutbox.mockResolvedValue({
      claimed: 0,
      sent: 0,
      cancelled: 0,
      failed: 0,
    })

    const response = await GET(
      new Request(
        'http://localhost/api/cron/event-participation-notifications',
      ),
    )

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'claim failed' })
  })
})
