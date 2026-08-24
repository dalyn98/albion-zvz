import { describe, expect, it, vi } from 'vitest'
import {
  expireMemberTradeOrders,
  expireStaleCronRuns,
  pruneCronRunHistory,
} from '@/lib/cron-maintenance'

describe('cron maintenance', () => {
  it('expires member trade orders through the existing database RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { expired: 3 }, error: null })

    await expect(expireMemberTradeOrders({ rpc } as never)).resolves.toEqual({
      expired: 3,
    })
    expect(rpc).toHaveBeenCalledWith('expire_member_trade_orders')
  })

  it('marks lease-expired running cron rows as failed through the maintenance RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 3, error: null })

    await expect(expireStaleCronRuns({ rpc } as never)).resolves.toEqual({
      expired: 3,
    })
    expect(rpc).toHaveBeenCalledWith('expire_stale_cron_runs')
  })

  it('prunes only completed cron runs older than 30 days in bounded chunks', async () => {
    const ids = Array.from({ length: 401 }, (_, index) => ({ id: `run-${index}` }))
    const selectLimit = vi.fn().mockResolvedValue({ data: ids, error: null })
    const selectQuery = {
      select: vi.fn(),
      neq: vi.fn(),
      lt: vi.fn(),
      order: vi.fn(),
      limit: selectLimit,
    }
    selectQuery.select.mockReturnValue(selectQuery)
    selectQuery.neq.mockReturnValue(selectQuery)
    selectQuery.lt.mockReturnValue(selectQuery)
    selectQuery.order.mockReturnValue(selectQuery)

    const deletedBatches: string[][] = []
    const deleteQuery = {
      delete: vi.fn(),
      in: vi.fn(),
      select: vi.fn(),
    }
    deleteQuery.delete.mockReturnValue(deleteQuery)
    deleteQuery.in.mockImplementation((_column: string, batch: string[]) => {
      deletedBatches.push(batch)
      return deleteQuery
    })
    deleteQuery.select.mockImplementation(async () => ({
      data: deletedBatches.at(-1)?.map((id) => ({ id })) ?? [],
      error: null,
    }))

    const from = vi
      .fn()
      .mockReturnValueOnce(selectQuery)
      .mockReturnValue(deleteQuery)
    const now = new Date('2026-08-07T00:00:00.000Z')

    await expect(pruneCronRunHistory({ from } as never, now)).resolves.toEqual({
      deleted: 401,
      cutoff: '2026-07-08T00:00:00.000Z',
      remainingBatch: false,
    })
    expect(selectQuery.neq).toHaveBeenCalledWith('status', 'running')
    expect(selectQuery.lt).toHaveBeenCalledWith(
      'started_at',
      '2026-07-08T00:00:00.000Z',
    )
    expect(selectLimit).toHaveBeenCalledWith(5_000)
    expect(deletedBatches.map((batch) => batch.length)).toEqual([200, 200, 1])
  })
})
