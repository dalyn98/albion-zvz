import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  getSession: vi.fn(),
  sessionHas: vi.fn(),
  getSessionGuildId: vi.fn(),
  getTranslations: vi.fn(),
  getLogOperatingStart: vi.fn(),
  logAdminAction: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
  sessionHas: mocks.sessionHas,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminAction,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}))

vi.mock('@/lib/log-operating-start-server', () => ({
  getLogOperatingStart: mocks.getLogOperatingStart,
}))

import { deleteSiphonRow, importSiphonLog, resetSiphonLedger } from './siphon-admin'

interface DeleteResult {
  data: Array<{ id: string; [key: string]: unknown }> | null
  error: { message: string } | null
}

interface DeleteCountResult {
  count: number | null
  error: { message: string } | null
}

interface QueryCall {
  method: string
  args: unknown[]
}

interface DeleteCountQuery {
  delete: (options?: { count: 'exact' }) => DeleteCountQuery
  eq: (column: string, value: unknown) => Promise<DeleteCountResult>
}

interface DeleteQuery {
  delete: () => DeleteQuery
  eq: (column: string, value: unknown) => DeleteQuery
  not: (column: string, operator: string, value: unknown) => DeleteQuery
  select: (columns: string) => Promise<DeleteResult>
}

function createDeleteCountQuery(result: DeleteCountResult): {
  query: DeleteCountQuery
  calls: QueryCall[]
} {
  const calls: QueryCall[] = []
  const query: DeleteCountQuery = {
    delete: (options) => {
      calls.push({ method: 'delete', args: options ? [options] : [] })
      return query
    },
    eq: (column, value) => {
      calls.push({ method: 'eq', args: [column, value] })
      return Promise.resolve(result)
    },
  }
  return { query, calls }
}

function createDeleteQuery(result: DeleteResult): {
  query: DeleteQuery
  calls: QueryCall[]
} {
  const calls: QueryCall[] = []
  const query: DeleteQuery = {
    delete: () => {
      calls.push({ method: 'delete', args: [] })
      return query
    },
    eq: (column, value) => {
      calls.push({ method: 'eq', args: [column, value] })
      return query
    },
    not: (column, operator, value) => {
      calls.push({ method: 'not', args: [column, operator, value] })
      return query
    },
    select: (columns) => {
      calls.push({ method: 'select', args: [columns] })
      return Promise.resolve(result)
    },
  }
  return { query, calls }
}

interface ImportQuery {
  select: (columns: string) => ImportQuery
  eq: (column: string, value: unknown) => ImportQuery
  gte: (column: string, value: unknown) => ImportQuery
  lte: (column: string, value: unknown) => ImportQuery
  order: (column: string, options?: { ascending?: boolean }) => ImportQuery
  range: (from: number, to: number) => Promise<{ data: unknown[]; error: null }>
  limit: (count: number) => ImportQuery
  maybeSingle: () => Promise<{ data: null; error: null }>
  insert: (rows: unknown[]) => Promise<{ error: { message: string } | null }>
}

function createImportDb(insertResults: Array<{ error: { message: string } | null }>) {
  const calls: QueryCall[] = []
  const query: ImportQuery = {
    select: (columns) => {
      calls.push({ method: 'select', args: [columns] })
      return query
    },
    eq: (column, value) => {
      calls.push({ method: 'eq', args: [column, value] })
      return query
    },
    gte: (column, value) => {
      calls.push({ method: 'gte', args: [column, value] })
      return query
    },
    lte: (column, value) => {
      calls.push({ method: 'lte', args: [column, value] })
      return query
    },
    range: (from, to) => {
      calls.push({ method: 'range', args: [from, to] })
      return Promise.resolve({ data: [], error: null })
    },
    order: (column, options) => {
      calls.push({ method: 'order', args: options ? [column, options] : [column] })
      return query
    },
    limit: (count) => {
      calls.push({ method: 'limit', args: [count] })
      return query
    },
    maybeSingle: () => {
      calls.push({ method: 'maybeSingle', args: [] })
      return Promise.resolve({ data: null, error: null })
    },
    insert: (rows) => {
      calls.push({ method: 'insert', args: [rows] })
      const next = insertResults.shift() ?? { error: null }
      return Promise.resolve(next)
    },
  }
  const from = vi.fn((table: string) => {
    expect(table).toBe('siphon_ledger')
    return query
  })
  return { db: { from }, calls, from }
}

describe('importSiphonLog', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
    mocks.getSession.mockReset()
    mocks.sessionHas.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.getTranslations.mockReset()
    mocks.getLogOperatingStart.mockReset()
    mocks.logAdminAction.mockReset()
    mocks.revalidatePath.mockReset()

    mocks.getTranslations.mockResolvedValue((key: string) => key)
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.sessionHas.mockReturnValue(true)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getLogOperatingStart.mockResolvedValue(null)
  })

  it('falls back to row-level inserts when a batch contains an unobserved duplicate', async () => {
    const duplicateError = { message: 'duplicate key value violates unique constraint' }
    const { db, calls } = createImportDb([
      { error: duplicateError },
      { error: duplicateError },
      { error: null },
    ])
    mocks.getAdminClient.mockReturnValue(db)

    const raw = [
      '"날짜"\t"플레이어"\t"목적"\t"수량"',
      '"2026-05-29 12:23:03"\t"sarangzzang"\t"출금"\t"-6797"',
      '"2026-05-29 12:23:05"\t"sarangzzang"\t"입금"\t"6807"',
    ].join('\n')

    await expect(importSiphonLog(raw)).resolves.toMatchObject({
      parsedTotal: 2,
      siphonRows: 2,
      inserted: 1,
      duplicatesSkipped: 1,
      depositTotal: 6807,
      withdrawTotal: 0,
      affectedPlayers: 1,
    })

    const insertCalls = calls.filter((call) => call.method === 'insert')
    expect(insertCalls).toHaveLength(3)
    expect((insertCalls[0].args[0] as unknown[])).toHaveLength(2)
    expect((insertCalls[1].args[0] as unknown[])).toHaveLength(1)
    expect((insertCalls[2].args[0] as unknown[])).toHaveLength(1)
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: 'guild-1',
        action: 'siphon.log.import',
        details: expect.objectContaining({
          inserted: 1,
          duplicatesSkipped: 1,
          depositTotal: 6807,
          withdrawTotal: 0,
        }),
      }),
    )
  })

  it('counts duplicate rows inside the pasted batch during dry-run', async () => {
    const { db, calls } = createImportDb([])
    mocks.getAdminClient.mockReturnValue(db)

    const raw = [
      '"날짜"\t"플레이어"\t"목적"\t"수량"',
      '"2026-05-29 12:23:05"\t"sarangzzang"\t"입금"\t"6807"',
      '"2026-05-29 12:23:05"\t"sarangzzang"\t"입금"\t"6807"',
    ].join('\n')

    await expect(importSiphonLog(raw, { dryRun: true })).resolves.toMatchObject({
      parsedTotal: 2,
      siphonRows: 2,
      inserted: 0,
      duplicatesSkipped: 1,
      depositTotal: 6807,
      withdrawTotal: 0,
      affectedPlayers: 1,
    })

    expect(calls.filter((call) => call.method === 'insert')).toEqual([])
  })
})

describe('resetSiphonLedger', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
    mocks.getSession.mockReset()
    mocks.sessionHas.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.getTranslations.mockReset()
    mocks.getLogOperatingStart.mockReset()
    mocks.logAdminAction.mockReset()
    mocks.revalidatePath.mockReset()
  })

  it('requires a session with siphon management permission', async () => {
    mocks.getSession.mockResolvedValue(null)

    await expect(resetSiphonLedger()).resolves.toEqual({
      deletedRows: 0,
      error: 'Unauthorized',
    })
    expect(mocks.getAdminClient).not.toHaveBeenCalled()

    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.sessionHas.mockReturnValue(false)

    await expect(resetSiphonLedger()).resolves.toEqual({
      deletedRows: 0,
      error: 'Unauthorized',
    })
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it('deletes only the current guild siphon rows and writes an audit entry', async () => {
    const { query, calls } = createDeleteCountQuery({
      count: 2,
      error: null,
    })
    const from = vi.fn((table: string) => {
      expect(table).toBe('siphon_ledger')
      return query
    })

    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.sessionHas.mockReturnValue(true)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(resetSiphonLedger()).resolves.toEqual({ deletedRows: 2 })

    expect(calls).toEqual([
      { method: 'delete', args: [{ count: 'exact' }] },
      { method: 'eq', args: ['guild_id', 'guild-1'] },
    ])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/siphon')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/me')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/me/siphon')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(mocks.logAdminAction).toHaveBeenCalledWith({
      guildId: 'guild-1',
      adminDiscordId: 'admin-1',
      action: 'siphon.log.reset',
      targetKind: 'siphon_ledger',
      details: {
        deletedRows: 2,
      },
    })
  })

  it('returns the database error without writing audit logs', async () => {
    const { query } = createDeleteCountQuery({
      count: null,
      error: { message: 'db down' },
    })
    const from = vi.fn(() => query)

    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.sessionHas.mockReturnValue(true)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(resetSiphonLedger()).resolves.toEqual({
      deletedRows: 0,
      error: 'db down',
    })
    expect(mocks.logAdminAction).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})

describe('deleteSiphonRow', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
    mocks.getSession.mockReset()
    mocks.sessionHas.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.logAdminAction.mockReset()
    mocks.revalidatePath.mockReset()
  })

  it('deletes only the current guild row and refreshes every siphon surface', async () => {
    const rowId = '11111111-1111-4111-8111-111111111111'
    const { query, calls } = createDeleteQuery({
      data: [
        {
          id: rowId,
          player: 'MonKKu',
          item_name_raw: 'Siphoned Energy',
          quantity: -10,
          logged_at: '2026-05-24T08:48:30.000Z',
        },
      ],
      error: null,
    })
    const from = vi.fn((table: string) => {
      expect(table).toBe('siphon_ledger')
      return query
    })

    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })
    mocks.sessionHas.mockReturnValue(true)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(deleteSiphonRow(rowId)).resolves.toEqual({})

    expect(calls).toEqual([
      { method: 'delete', args: [] },
      { method: 'eq', args: ['guild_id', 'guild-1'] },
      { method: 'eq', args: ['id', rowId] },
      { method: 'select', args: ['id, player, item_name_raw, quantity, logged_at'] },
    ])
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/siphon')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/me')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/me/siphon')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(mocks.logAdminAction).toHaveBeenCalledWith({
      guildId: 'guild-1',
      adminDiscordId: 'admin-1',
      action: 'siphon.log.delete',
      targetId: rowId,
      targetKind: 'siphon_ledger',
      details: {
        player: 'MonKKu',
        quantity: -10,
        loggedAt: '2026-05-24T08:48:30.000Z',
      },
    })
  })
})
