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

vi.mock('@/lib/auth', () => ({
  requireLiveSession: async () => {
    const session = await mocks.getSession()
    if (!session) throw new Error('Unauthorized')
    return session
  },
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

import { approveSlotRequest } from './bomb-squad'

interface QueryCall {
  method: string
  args: unknown[]
}

interface SlotQuery {
  select: (columns: string) => SlotQuery
  eq: (column: string, value: unknown) => SlotQuery
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>
}

function createSlotQuery(data: unknown): {
  query: SlotQuery
  calls: QueryCall[]
} {
  const calls: QueryCall[] = []
  const query: SlotQuery = {
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

function pendingBombSlot(overrides: Record<string, unknown> = {}) {
  return {
    id: 'slot-1',
    requested_discord_id: 'member-1',
    is_solo_bomb: false,
    parties: {
      is_bomb_squad: true,
      caller_discord_id: 'caller-1',
      party_number: 2,
      events: {
        id: 'event-1',
        created_by: 'owner-1',
        battle_started_at: null,
      },
    },
    ...overrides,
  }
}

describe('approveSlotRequest', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
    mocks.getSession.mockReset()
    mocks.sessionHas.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.revalidatePath.mockReset()
  })

  it('requires retained event creation authority for the original event owner', async () => {
    const { query } = createSlotQuery(pendingBombSlot())
    const rpc = vi.fn().mockResolvedValue({ error: null })

    mocks.getSession.mockResolvedValue({
      discordId: 'owner-1',
      isAdmin: false,
      canCreateEvents: false,
    })
    mocks.sessionHas.mockReturnValue(false)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({ from: vi.fn(() => query), rpc })

    await expect(approveSlotRequest('slot-1')).resolves.toEqual({
      error: 'bombSquadNotAuthorized',
    })
    expect(rpc).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('allows the original event owner while they still can create events', async () => {
    const { query, calls } = createSlotQuery(pendingBombSlot())
    const from = vi.fn((table: string) => {
      expect(table).toBe('slots')
      return query
    })
    const rpc = vi.fn().mockResolvedValue({ error: null })

    mocks.getSession.mockResolvedValue({
      discordId: 'owner-1',
      isAdmin: false,
      canCreateEvents: true,
    })
    mocks.sessionHas.mockReturnValue(false)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({ from, rpc })

    await expect(approveSlotRequest('slot-1')).resolves.toEqual({})

    expect(calls).toEqual([
      {
        method: 'select',
        args: [
          'id, requested_discord_id, is_solo_bomb, parties!inner(is_bomb_squad, caller_discord_id, party_number, events!inner(id, created_by, battle_started_at))',
        ],
      },
      { method: 'eq', args: ['guild_id', 'guild-1'] },
      { method: 'eq', args: ['id', 'slot-1'] },
      { method: 'maybeSingle', args: [] },
    ])
    expect(rpc).toHaveBeenCalledWith('approve_slot_request', { p_slot_id: 'slot-1' })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/events/event-1')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/events/event-1')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/events/event-1/party/2')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/members/member-1')
  })

  it('rejects approval after the immutable operational start', async () => {
    const { query } = createSlotQuery(
      pendingBombSlot({
        parties: {
          is_bomb_squad: true,
          caller_discord_id: 'caller-1',
          party_number: 2,
          events: {
            id: 'event-1',
            created_by: 'owner-1',
            battle_started_at: '2026-07-31T12:00:00.000Z',
          },
        },
      }),
    )
    const rpc = vi.fn().mockResolvedValue({ error: null })

    mocks.getSession.mockResolvedValue({
      discordId: 'owner-1',
      isAdmin: false,
      canCreateEvents: true,
    })
    mocks.sessionHas.mockReturnValue(false)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({ from: vi.fn(() => query), rpc })

    await expect(approveSlotRequest('slot-1')).resolves.toEqual({
      error: 'battleAlreadyStarted',
    })
    expect(rpc).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
