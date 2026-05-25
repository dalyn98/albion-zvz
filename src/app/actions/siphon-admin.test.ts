import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  getSession: vi.fn(),
  sessionHas: vi.fn(),
  getSessionGuildId: vi.fn(),
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
  getTranslations: vi.fn(),
}))

import { deleteSiphonRow, resetSiphonLedger } from './siphon-admin'

interface DeleteResult {
  data: Array<{ id: string; [key: string]: unknown }> | null
  error: { message: string } | null
}

interface QueryCall {
  method: string
  args: unknown[]
}

interface DeleteQuery {
  delete: () => DeleteQuery
  eq: (column: string, value: unknown) => DeleteQuery
  not: (column: string, operator: string, value: unknown) => DeleteQuery
  select: (columns: string) => Promise<DeleteResult>
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

describe('resetSiphonLedger', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
    mocks.getSession.mockReset()
    mocks.sessionHas.mockReset()
    mocks.getSessionGuildId.mockReset()
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
    const { query, calls } = createDeleteQuery({
      data: [{ id: 'row-1' }, { id: 'row-2' }],
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
      { method: 'delete', args: [] },
      { method: 'eq', args: ['guild_id', 'guild-1'] },
      { method: 'not', args: ['id', 'is', null] },
      { method: 'select', args: ['id'] },
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
    const { query } = createDeleteQuery({
      data: null,
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
