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

vi.mock('@/lib/event-guest-profile', () => ({
  getEventGuestProfile: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

import { adminCancelSlot } from './member'

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

function assignedSlot(overrides: Record<string, unknown> = {}) {
  return {
    assigned_discord_id: 'member-1',
    is_solo_bomb: false,
    parties: {
      event_id: 'event-1',
      party_number: 2,
      is_bomb_squad: false,
      caller_discord_id: null,
      events: { created_by: 'owner-1' },
    },
    ...overrides,
  }
}

describe('adminCancelSlot', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
    mocks.getSession.mockReset()
    mocks.sessionHas.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.revalidatePath.mockReset()
  })

  it('allows delegated event managers to remove an assigned member from an event slot', async () => {
    const { query, calls } = createSlotQuery(assignedSlot())
    const from = vi.fn((table: string) => {
      expect(table).toBe('slots')
      return query
    })
    const rpc = vi.fn().mockResolvedValue({ error: null })

    mocks.getSession.mockResolvedValue({
      discordId: 'manager-1',
      isAdmin: false,
      canCreateEvents: false,
    })
    mocks.sessionHas.mockReturnValue(true)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({ from, rpc })

    await expect(adminCancelSlot('slot-1')).resolves.toEqual({})

    expect(calls).toEqual([
      {
        method: 'select',
        args: [
          'assigned_discord_id, is_solo_bomb, parties!inner(event_id, party_number, is_bomb_squad, caller_discord_id, events!inner(created_by))',
        ],
      },
      { method: 'eq', args: ['guild_id', 'guild-1'] },
      { method: 'eq', args: ['id', 'slot-1'] },
      { method: 'maybeSingle', args: [] },
    ])
    expect(rpc).toHaveBeenCalledWith('cancel_slot', {
      p_slot_id: 'slot-1',
      p_discord_id: 'member-1',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/events/event-1')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/admin/dashboard/events/event-1')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/events/event-1/party/2')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/members/member-1')
  })

  it('allows the assigned bomb squad caller to remove a member from their own party', async () => {
    const { query } = createSlotQuery(
      assignedSlot({
        parties: {
          event_id: 'event-1',
          party_number: 3,
          is_bomb_squad: true,
          caller_discord_id: 'caller-1',
          events: { created_by: 'owner-1' },
        },
      }),
    )
    const rpc = vi.fn().mockResolvedValue({ error: null })

    mocks.getSession.mockResolvedValue({
      discordId: 'caller-1',
      isAdmin: false,
      canCreateEvents: false,
    })
    mocks.sessionHas.mockReturnValue(false)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({ from: vi.fn(() => query), rpc })

    await expect(adminCancelSlot('slot-1')).resolves.toEqual({})

    expect(rpc).toHaveBeenCalledWith('cancel_slot', {
      p_slot_id: 'slot-1',
      p_discord_id: 'member-1',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/events/event-1/party/3')
  })

  it('rejects members without event management or caller authority', async () => {
    const { query } = createSlotQuery(assignedSlot())
    const rpc = vi.fn().mockResolvedValue({ error: null })

    mocks.getSession.mockResolvedValue({
      discordId: 'member-2',
      isAdmin: false,
      canCreateEvents: false,
    })
    mocks.sessionHas.mockReturnValue(false)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({ from: vi.fn(() => query), rpc })

    await expect(adminCancelSlot('slot-1')).resolves.toEqual({
      error: 'slotAssignNotAuthorized',
    })
    expect(rpc).not.toHaveBeenCalled()
  })
})
