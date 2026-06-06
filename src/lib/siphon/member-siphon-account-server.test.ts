import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  isMissingRpcError: vi.fn(),
}))

vi.mock('@/lib/supabase-rpc-errors', () => ({
  isMissingRpcError: mocks.isMissingRpcError,
}))

import { loadMemberSiphonAccount } from './member-siphon-account-server'

interface QueryCall {
  method: string
  args: unknown[]
}

function createPagedSiphonDb(
  pages: unknown[][],
  rpcError: { message: string; code?: string } = { message: 'not found', code: 'PGRST202' },
) {
  const calls: QueryCall[] = []
  const pendingPages = [...pages]
  const query = {
    select: (columns: string) => {
      calls.push({ method: 'select', args: [columns] })
      return query
    },
    eq: (column: string, value: unknown) => {
      calls.push({ method: 'eq', args: [column, value] })
      return query
    },
    gte: (column: string, value: unknown) => {
      calls.push({ method: 'gte', args: [column, value] })
      return query
    },
    order: (column: string, options?: { ascending?: boolean }) => {
      calls.push({ method: 'order', args: options ? [column, options] : [column] })
      return query
    },
    range: (from: number, to: number) => {
      calls.push({ method: 'range', args: [from, to] })
      return Promise.resolve({ data: pendingPages.shift() ?? [], error: null })
    },
  }

  const rpc = vi.fn(async () => ({ data: null, error: rpcError }))
  const from = vi.fn((table: string) => {
    expect(table).toBe('siphon_ledger')
    return query
  })

  return { db: { rpc, from }, calls, rpc, from }
}

describe('loadMemberSiphonAccount', () => {
  beforeEach(() => {
    mocks.isMissingRpcError.mockReset()
  })

  it('loads totals and recent rows through the member aggregate RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: [{
        player: 'Alpha',
        deposited: '12',
        withdrawn: '5',
        net: '7',
        last_activity_at: '2026-05-02T00:00:00.000Z',
        rows: [{
          logged_at: '2026-05-02T00:00:00.000Z',
          item_name_raw: 'Siphoned Energy',
          quantity: -5,
        }],
      }],
      error: null,
    }))
    const from = vi.fn()

    await expect(loadMemberSiphonAccount({
      db: { rpc, from } as never,
      guildId: 'guild-1',
      player: 'Alpha',
      operatingStart: new Date('2026-05-01T00:00:00.000Z'),
      recentLimit: 5,
    })).resolves.toEqual({
      account: {
        player: 'Alpha',
        deposited: 12,
        withdrawn: 5,
        net: 7,
        lastActivityAt: '2026-05-02T00:00:00.000Z',
        rows: [{
          loggedAt: '2026-05-02T00:00:00.000Z',
          itemNameRaw: 'Siphoned Energy',
          quantity: -5,
        }],
      },
    })

    expect(rpc).toHaveBeenCalledWith('get_member_siphon_account', {
      p_guild_id: 'guild-1',
      p_player: 'Alpha',
      p_operating_start: '2026-05-01T00:00:00.000Z',
      p_recent_limit: 5,
    })
    expect(from).not.toHaveBeenCalled()
  })

  it('falls back to paged ledger reads only when the aggregate RPC is missing', async () => {
    mocks.isMissingRpcError.mockReturnValue(true)
    const { db, calls, from } = createPagedSiphonDb([
      [
        {
          logged_at: '2026-05-03T00:00:00.000Z',
          item_name_raw: 'Siphoned Energy',
          quantity: -3,
        },
        {
          logged_at: '2026-05-02T00:00:00.000Z',
          item_name_raw: 'Siphoned Energy',
          quantity: 10,
        },
      ],
    ])

    await expect(loadMemberSiphonAccount({
      db: db as never,
      guildId: 'guild-1',
      player: 'Alpha',
      operatingStart: new Date('2026-05-01T00:00:00.000Z'),
      recentLimit: 1,
    })).resolves.toEqual({
      account: {
        player: 'Alpha',
        deposited: 10,
        withdrawn: 3,
        net: 7,
        lastActivityAt: '2026-05-03T00:00:00.000Z',
        rows: [{
          loggedAt: '2026-05-03T00:00:00.000Z',
          itemNameRaw: 'Siphoned Energy',
          quantity: -3,
        }],
      },
    })

    expect(from).toHaveBeenCalledWith('siphon_ledger')
    expect(calls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
    expect(calls).toContainEqual({ method: 'eq', args: ['player', 'Alpha'] })
    expect(calls).toContainEqual({ method: 'gte', args: ['logged_at', '2026-05-01T00:00:00.000Z'] })
  })

  it('returns an error instead of scanning the ledger for non-missing RPC errors', async () => {
    mocks.isMissingRpcError.mockReturnValue(false)
    const { db, from } = createPagedSiphonDb([], { message: 'permission denied' })

    await expect(loadMemberSiphonAccount({
      db: db as never,
      guildId: 'guild-1',
      player: 'Alpha',
      operatingStart: null,
      recentLimit: 0,
    })).resolves.toEqual({ error: 'permission denied' })

    expect(from).not.toHaveBeenCalled()
  })
})
