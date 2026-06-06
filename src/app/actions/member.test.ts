import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  getSession: vi.fn(),
  sessionHas: vi.fn(),
  getSessionGuildId: vi.fn(),
  getEventGuestProfile: vi.fn(),
  getAlbionEventAccessGateState: vi.fn(),
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
  getEventGuestProfile: mocks.getEventGuestProfile,
}))

vi.mock('@/lib/albion-identity', () => ({
  getAlbionEventAccessGateState: mocks.getAlbionEventAccessGateState,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

import { adminCancelSlot, assignSlot, cancelSlot } from './member'

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
    mocks.getEventGuestProfile.mockReset()
    mocks.getAlbionEventAccessGateState.mockReset()
    mocks.revalidatePath.mockReset()
  })

  it('allows an event-scoped guest to assign using the event slot scope even with a stale guild fallback', async () => {
    const { query, calls } = createSlotQuery({
      guild_id: 'event-guild',
      is_hidden: false,
      parties: {
        event_id: 'event-1',
        party_number: 1,
        is_bomb_squad: false,
      },
    })
    const rpc = vi.fn().mockResolvedValue({ error: null })

    mocks.getSession.mockResolvedValue({
      discordId: 'guest-1',
      username: 'Discord Guest',
      isMember: false,
      isGuest: true,
      eventScope: 'event-1',
    })
    mocks.getSessionGuildId.mockResolvedValue('stale-primary-guild')
    mocks.getEventGuestProfile.mockResolvedValue({ displayName: 'Guest Alias' })
    mocks.getAdminClient.mockReturnValue({ from: vi.fn(() => query), rpc })

    await expect(assignSlot('slot-1')).resolves.toEqual({ pending: false })

    expect(calls).toEqual([
      {
        method: 'select',
        args: ['guild_id, is_hidden, parties!inner(is_bomb_squad, event_id, party_number)'],
      },
      { method: 'eq', args: ['id', 'slot-1'] },
      { method: 'eq', args: ['parties.event_id', 'event-1'] },
      { method: 'maybeSingle', args: [] },
    ])
    expect(mocks.getEventGuestProfile).toHaveBeenCalledWith('event-guild', 'event-1', 'guest-1')
    expect(rpc).toHaveBeenCalledWith('assign_slot', {
      p_slot_id: 'slot-1',
      p_discord_id: 'guest-1',
      p_username: 'Guest Alias',
      p_picks: null,
    })
  })

  it('allows a verified same-alliance participant to assign a visible event slot', async () => {
    const { query } = createSlotQuery({
      guild_id: 'guild-1',
      is_hidden: false,
      parties: {
        event_id: 'event-1',
        party_number: 1,
        is_bomb_squad: false,
      },
    })
    const rpc = vi.fn().mockResolvedValue({ error: null })

    mocks.getSession.mockResolvedValue({
      discordId: 'ally-1',
      username: 'Ally',
      isMember: false,
      isGuest: false,
      isAllianceCandidate: true,
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAlbionEventAccessGateState.mockResolvedValue({
      memberEventAccessAllowed: true,
      memberEventVerificationRequired: false,
      allianceEventAllowed: true,
    })
    mocks.getAdminClient.mockReturnValue({ from: vi.fn(() => query), rpc })

    await expect(assignSlot('slot-1')).resolves.toEqual({ pending: false })

    expect(mocks.getAlbionEventAccessGateState).toHaveBeenCalledWith({
      discordId: 'ally-1',
      guildId: 'guild-1',
      isAdmin: false,
      isMember: false,
    })
    expect(rpc).toHaveBeenCalledWith('assign_slot', {
      p_slot_id: 'slot-1',
      p_discord_id: 'ally-1',
      p_username: 'Ally',
      p_picks: null,
    })
  })

  it('blocks an unverified member from assigning a slot when event access requires Albion verification', async () => {
    const { query } = createSlotQuery({
      guild_id: 'guild-1',
      is_hidden: false,
      parties: {
        event_id: 'event-1',
        party_number: 1,
        is_bomb_squad: false,
      },
    })
    const rpc = vi.fn().mockResolvedValue({ error: null })

    mocks.getSession.mockResolvedValue({
      discordId: 'member-1',
      username: 'Member',
      isAdmin: false,
      isMember: true,
      isGuest: false,
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAlbionEventAccessGateState.mockResolvedValue({
      memberEventAccessAllowed: false,
      memberEventVerificationRequired: true,
      allianceEventAllowed: false,
    })
    mocks.getAdminClient.mockReturnValue({ from: vi.fn(() => query), rpc })

    await expect(assignSlot('slot-1')).resolves.toEqual({
      error: 'albionVerificationRequired',
    })

    expect(rpc).not.toHaveBeenCalled()
  })

  it('blocks a reset member from assigning a slot even when unverified access is otherwise allowed', async () => {
    const { query } = createSlotQuery({
      guild_id: 'guild-1',
      is_hidden: false,
      parties: {
        event_id: 'event-1',
        party_number: 1,
        is_bomb_squad: false,
      },
    })
    const rpc = vi.fn().mockResolvedValue({ error: null })

    mocks.getSession.mockResolvedValue({
      discordId: 'member-1',
      username: 'Member',
      isAdmin: false,
      isMember: true,
      isGuest: false,
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAlbionEventAccessGateState.mockResolvedValue({
      memberEventAccessAllowed: false,
      memberOnboardingRequired: true,
      memberEventVerificationRequired: false,
      allianceEventAllowed: false,
    })
    mocks.getAdminClient.mockReturnValue({ from: vi.fn(() => query), rpc })

    await expect(assignSlot('slot-1')).resolves.toEqual({
      error: 'albionVerificationRequired',
    })

    expect(rpc).not.toHaveBeenCalled()
  })

  it('allows a member to cancel their own FF slot after the event has started', async () => {
    const { query } = createSlotQuery({
      guild_id: 'guild-1',
      party_id: 'party-1',
      parties: {
        event_id: 'event-1',
        party_number: 1,
        events: {
          battle_started_at: '2026-01-01T12:00:00.000Z',
          category: 'FF',
        },
      },
    })
    const rpc = vi.fn().mockResolvedValue({ error: null })

    mocks.getSession.mockResolvedValue({
      discordId: 'member-1',
      username: 'Member',
      isAdmin: false,
      isMember: true,
      isGuest: false,
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({ from: vi.fn(() => query), rpc })

    await expect(cancelSlot('slot-1')).resolves.toEqual({})

    expect(rpc).toHaveBeenCalledWith('cancel_slot', {
      p_slot_id: 'slot-1',
      p_discord_id: 'member-1',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/events/event-1')
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/events/event-1/party/1')
  })

  it('keeps started combat event slots locked for member self-cancel', async () => {
    const { query } = createSlotQuery({
      guild_id: 'guild-1',
      party_id: 'party-1',
      parties: {
        event_id: 'event-1',
        party_number: 1,
        events: {
          battle_started_at: '2026-01-01T12:00:00.000Z',
          category: '전투',
        },
      },
    })
    const rpc = vi.fn().mockResolvedValue({ error: null })

    mocks.getSession.mockResolvedValue({
      discordId: 'member-1',
      username: 'Member',
      isAdmin: false,
      isMember: true,
      isGuest: false,
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({ from: vi.fn(() => query), rpc })

    await expect(cancelSlot('slot-1')).resolves.toEqual({
      error: 'battleAlreadyStarted',
    })

    expect(rpc).not.toHaveBeenCalled()
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
