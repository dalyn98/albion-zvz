import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  getSession: vi.fn(),
  sessionHas: vi.fn(),
  getSessionGuildId: vi.fn(),
  revalidatePath: vi.fn(),
  prepareEventSlotRegearParticipantSnapshot: vi.fn(),
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

vi.mock('@/lib/regear-effective-policy-server', () => ({
  prepareEventSlotRegearParticipantSnapshot:
    mocks.prepareEventSlotRegearParticipantSnapshot,
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
    requested_username: 'Member One',
    role_name: 'Support',
    manual_regear_excluded: false,
    auto_regear_excluded: false,
    is_solo_bomb: false,
    parties: {
      is_bomb_squad: true,
      caller_discord_id: 'caller-1',
      party_number: 2,
      events: {
        id: 'event-1',
        created_by: 'owner-1',
        battle_started_at: null,
        regear_policy_version_id: null,
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
    mocks.prepareEventSlotRegearParticipantSnapshot.mockReset()
    mocks.prepareEventSlotRegearParticipantSnapshot.mockResolvedValue({
      policyVersionId: 'policy-1',
      discordId: 'member-1',
      username: 'Member One',
      roleName: 'Support',
      manualExcluded: false,
      autoExcluded: false,
      manualPolicy: { version: 1, policyVersionId: 'policy-1' },
      autoPolicy: { version: 1, policyVersionId: 'policy-1' },
      sources: { version: 1, policyVersionId: 'policy-1' },
    })
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
          'id, requested_discord_id, requested_username, role_name, manual_regear_excluded, auto_regear_excluded, is_solo_bomb, parties!inner(is_bomb_squad, caller_discord_id, party_number, events!inner(id, created_by, battle_started_at, regear_policy_version_id))',
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

  it('allows an event owner to approve a pending request after operational start', async () => {
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
            regear_policy_version_id: 'policy-1',
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

    await expect(approveSlotRequest('slot-1')).resolves.toEqual({})
    expect(mocks.prepareEventSlotRegearParticipantSnapshot).toHaveBeenCalledWith({
      db: expect.any(Object),
      guildId: 'guild-1',
      eventId: 'event-1',
      discordId: 'member-1',
      username: 'Member One',
      roleName: 'Support',
      manualExcluded: false,
      autoExcluded: false,
    })
    expect(rpc).toHaveBeenCalledWith('admin_approve_event_slot_request_with_regear_snapshot', {
      p_guild_id: 'guild-1',
      p_slot_id: 'slot-1',
      p_policy_version_id: 'policy-1',
      p_discord_id: 'member-1',
      p_username: 'Member One',
      p_role_name: 'Support',
      p_manual_excluded: false,
      p_auto_excluded: false,
      p_manual_policy_snapshot: { version: 1, policyVersionId: 'policy-1' },
      p_auto_policy_snapshot: { version: 1, policyVersionId: 'policy-1' },
      p_source_snapshot: { version: 1, policyVersionId: 'policy-1' },
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/events/event-1')
  })

  it('allows a bomb squad caller to review requests after operational start', async () => {
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
            regear_policy_version_id: 'policy-1',
          },
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

    await expect(approveSlotRequest('slot-1')).resolves.toEqual({})
    expect(rpc).toHaveBeenCalledWith('admin_approve_event_slot_request_with_regear_snapshot', {
      p_guild_id: 'guild-1',
      p_slot_id: 'slot-1',
      p_policy_version_id: 'policy-1',
      p_discord_id: 'member-1',
      p_username: 'Member One',
      p_role_name: 'Support',
      p_manual_excluded: false,
      p_auto_excluded: false,
      p_manual_policy_snapshot: { version: 1, policyVersionId: 'policy-1' },
      p_auto_policy_snapshot: { version: 1, policyVersionId: 'policy-1' },
      p_source_snapshot: { version: 1, policyVersionId: 'policy-1' },
    })
  })
})
