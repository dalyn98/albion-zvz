import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  getSession: vi.fn(),
  sessionHas: vi.fn(),
  getSessionGuildId: vi.fn(),
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

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

import {
  adminUpsertTentativeSignup,
  removeTentativeSignup,
} from './event-tentative'

interface QueryCall {
  method: string
  args: unknown[]
}

interface EventQuery {
  select: (columns: string) => EventQuery
  eq: (column: string, value: unknown) => EventQuery
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>
}

function createEventQuery(data: unknown): {
  query: EventQuery
  calls: QueryCall[]
} {
  const calls: QueryCall[] = []
  const query: EventQuery = {
    select: (columns) => {
      calls.push({ method: 'select', args: [columns] })
      return query
    },
    eq: (column, value) => {
      calls.push({ method: 'eq', args: [column, value] })
      return query
    },
    maybeSingle: () => {
      calls.push({ method: 'maybeSingle', args: [] })
      return Promise.resolve({ data, error: null })
    },
  }
  return { query, calls }
}

describe('event tentative signup management permissions', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
    mocks.getSession.mockReset()
    mocks.sessionHas.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.revalidatePath.mockReset()
  })

  it('does not let a former event creator remove someone else from tentative signups', async () => {
    const { query } = createEventQuery({ id: 'event-1', created_by: 'owner-1' })
    const deleteQuery = {
      delete: vi.fn(() => deleteQuery),
      eq: vi.fn(() => deleteQuery),
    }
    const from = vi.fn((table: string) => {
      if (table === 'events') return query
      if (table === 'event_tentative_signups') return deleteQuery
      throw new Error(`unexpected table: ${table}`)
    })

    mocks.getSession.mockResolvedValue({
      discordId: 'owner-1',
      username: 'Owner',
      isAdmin: false,
      canCreateEvents: false,
    })
    mocks.sessionHas.mockReturnValue(false)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(removeTentativeSignup('event-1', 'member-1')).resolves.toEqual({
      error: 'notAuthorized',
    })
    expect(deleteQuery.delete).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('lets the current event owner manage tentative signups', async () => {
    const { query, calls } = createEventQuery({ id: 'event-1', created_by: 'owner-1' })
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn((table: string) => {
      if (table === 'events') return query
      if (table === 'event_tentative_signups') return { upsert }
      throw new Error(`unexpected table: ${table}`)
    })

    mocks.getSession.mockResolvedValue({
      discordId: 'owner-1',
      username: 'Owner',
      isAdmin: false,
      canCreateEvents: true,
    })
    mocks.sessionHas.mockReturnValue(false)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(
      adminUpsertTentativeSignup('event-1', 'member-1', 'Member', ['DefTanker'], 'can tank'),
    ).resolves.toEqual({})

    expect(calls).toEqual([
      { method: 'select', args: ['id, created_by'] },
      { method: 'eq', args: ['guild_id', 'guild-1'] },
      { method: 'eq', args: ['id', 'event-1'] },
      { method: 'maybeSingle', args: [] },
    ])
    expect(upsert).toHaveBeenCalledWith(
      {
        guild_id: 'guild-1',
        event_id: 'event-1',
        discord_id: 'member-1',
        username: 'Member',
        possible_roles: ['DefTanker'],
        notes: 'can tank',
      },
      { onConflict: 'guild_id,event_id,discord_id' },
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/events/event-1')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/events/event-1')
  })
})
