import { beforeEach, describe, expect, it, vi } from 'vitest'
import { REGEAR_WINDOW_MANAGE_CAPS } from '@/lib/regear-window-permissions'

const mocks = vi.hoisted(() => ({
  requireAnyCapability: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  requireAnyCapability: mocks.requireAnyCapability,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

import {
  closeRegearWindow,
  deleteRegearWindow,
  openRegearWindow,
} from './regear-windows'

interface QueryCall {
  method: string
  args: unknown[]
}

interface OpenInsertQuery {
  insert: (payload: Record<string, unknown>) => OpenInsertQuery
  select: (columns: string) => OpenInsertQuery
  single: () => Promise<{ data: { id: string }; error: null }>
}

function createOpenInsertQuery(id = 'window-1'): {
  query: OpenInsertQuery
  calls: QueryCall[]
} {
  const calls: QueryCall[] = []
  const query: OpenInsertQuery = {
    insert: (payload) => {
      calls.push({ method: 'insert', args: [payload] })
      return query
    },
    select: (columns) => {
      calls.push({ method: 'select', args: [columns] })
      return query
    },
    single: () => {
      calls.push({ method: 'single', args: [] })
      return Promise.resolve({ data: { id }, error: null })
    },
  }
  return { query, calls }
}

interface MutationQuery {
  update: (payload: Record<string, unknown>) => MutationQuery
  delete: () => MutationQuery
  eq: (column: string, value: unknown) => MutationQuery
  is: (column: string, value: unknown) => Promise<{ error: null }> | MutationQuery
}

function createMutationQuery(): {
  query: MutationQuery
  calls: QueryCall[]
} {
  const calls: QueryCall[] = []
  const query: MutationQuery = {
    update: (payload) => {
      calls.push({ method: 'update', args: [payload] })
      return query
    },
    delete: () => {
      calls.push({ method: 'delete', args: [] })
      return query
    },
    eq: (column, value) => {
      calls.push({ method: 'eq', args: [column, value] })
      return query
    },
    is: (column, value) => {
      calls.push({ method: 'is', args: [column, value] })
      return Promise.resolve({ error: null })
    },
  }
  return { query, calls }
}

interface CountQuery {
  select: (
    columns: string,
    options: { count: 'exact'; head: true },
  ) => CountQuery
  eq: (column: string, value: unknown) => Promise<{ count: number; error: null }> | CountQuery
}

function createCountQuery(count: number): {
  query: CountQuery
  calls: QueryCall[]
} {
  const calls: QueryCall[] = []
  let eqCalls = 0
  const query: CountQuery = {
    select: (columns, options) => {
      calls.push({ method: 'select', args: [columns, options] })
      return query
    },
    eq: (column, value) => {
      calls.push({ method: 'eq', args: [column, value] })
      eqCalls += 1
      if (eqCalls >= 2) return Promise.resolve({ count, error: null })
      return query
    },
  }
  return { query, calls }
}

describe('regear window admin actions', () => {
  beforeEach(() => {
    mocks.requireAnyCapability.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.getSession.mockResolvedValue({ discordId: 'officer-1', username: 'Officer' })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
  })

  it('lets delegated regear window officers open a window', async () => {
    const { query, calls } = createOpenInsertQuery('window-1')
    const db = { from: vi.fn(() => query) }
    mocks.requireAnyCapability.mockResolvedValue(db)

    const formData = new FormData()
    formData.set('title', 'CTA 리기어')
    formData.set('description', 'free claims')
    formData.set('maxDeathsPerMember', '2')
    formData.set('closesAt', '2026-05-26T12:00:00.000Z')

    await expect(openRegearWindow(formData)).resolves.toEqual({ id: 'window-1' })

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith(REGEAR_WINDOW_MANAGE_CAPS)
    expect(db.from).toHaveBeenCalledWith('regear_windows')
    expect(calls[0]).toMatchObject({ method: 'insert' })
    expect(calls[0].args[0]).toMatchObject({
      guild_id: 'guild-1',
      title: 'CTA 리기어',
      description: 'free claims',
      max_deaths_per_member: 2,
      closes_at: '2026-05-26T12:00:00.000Z',
      created_by_discord_id: 'officer-1',
      created_by_username: 'Officer',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/regear-windows')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/regear')
  })

  it('lets delegated regear window officers close a window', async () => {
    const { query, calls } = createMutationQuery()
    const db = { from: vi.fn(() => query) }
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(closeRegearWindow('window-1')).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith(REGEAR_WINDOW_MANAGE_CAPS)
    expect(calls.map((call) => call.method)).toEqual(['update', 'eq', 'eq', 'is'])
    expect(calls[1]).toEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
    expect(calls[2]).toEqual({ method: 'eq', args: ['id', 'window-1'] })
    expect(calls[3]).toEqual({ method: 'is', args: ['closed_at', null] })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/regear-windows')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/regear')
  })

  it('lets delegated regear window officers delete an empty window', async () => {
    const { query: countQuery, calls: countCalls } = createCountQuery(0)
    const { query: deleteQuery, calls: deleteCalls } = createMutationQuery()
    const db = {
      from: vi.fn((table: string) => {
        if (table === 'regear_requests') return countQuery
        if (table === 'regear_windows') return deleteQuery
        throw new Error(`unexpected table: ${table}`)
      }),
    }
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(deleteRegearWindow('window-1')).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith(REGEAR_WINDOW_MANAGE_CAPS)
    expect(countCalls).toEqual([
      { method: 'select', args: ['id', { count: 'exact', head: true }] },
      { method: 'eq', args: ['guild_id', 'guild-1'] },
      { method: 'eq', args: ['regear_window_id', 'window-1'] },
    ])
    expect(deleteCalls).toEqual([
      { method: 'delete', args: [] },
      { method: 'eq', args: ['guild_id', 'guild-1'] },
      { method: 'eq', args: ['id', 'window-1'] },
    ])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/regear-windows')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/regear')
  })
})
