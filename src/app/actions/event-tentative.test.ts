import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  getSession: vi.fn(),
  sessionHas: vi.fn(),
  getSessionGuildId: vi.fn(),
  getAlbionEventAccessGateState: vi.fn(),
  revalidatePath: vi.fn(),
  after: vi.fn(),
  sendTentativeSlotRecommendationNotification: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
  sessionHas: mocks.sessionHas,
}))

vi.mock('@/lib/auth', () => ({
  requireCurrentMutationSession: async () => {
    const session = await mocks.getSession()
    if (!session) throw new Error('Unauthorized')
    return session
  },
  requireLiveSession: async () => {
    const session = await mocks.getSession()
    if (!session) throw new Error('Unauthorized')
    return session
  },
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/albion-identity', () => ({
  getAlbionEventAccessGateState: mocks.getAlbionEventAccessGateState,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next/server', () => ({
  after: mocks.after,
}))

vi.mock('@/lib/event-tentative-notifications', () => ({
  sendTentativeSlotRecommendationNotification:
    mocks.sendTentativeSlotRecommendationNotification,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

import {
  adminUpsertTentativeSignup,
  removeTentativeSignup,
  setTentativeSlotRecommendation,
  submitMyTentativeSignup,
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
    mocks.getAlbionEventAccessGateState.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.after.mockReset()
    mocks.sendTentativeSlotRecommendationNotification.mockReset()
  })

  it('lets a verified same-alliance participant submit their tentative roles', async () => {
    const { query } = createEventQuery({
      id: 'event-1',
      status: 'published',
      battle_started_at: null,
      tentative_snapshot_version_id: null,
    })
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn((table: string) => {
      if (table === 'events') return query
      if (table === 'event_tentative_signups') return { upsert }
      throw new Error(`unexpected table: ${table}`)
    })

    mocks.getSession.mockResolvedValue({
      discordId: 'ally-1',
      username: 'Ally',
      isAdmin: false,
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
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(submitMyTentativeSignup('event-1', ['EngageDps'], 'can engage')).resolves.toEqual({})

    expect(upsert).toHaveBeenCalledWith(
      {
        guild_id: 'guild-1',
        event_id: 'event-1',
        discord_id: 'ally-1',
        username: 'Ally',
        possible_roles: ['EngageDps'],
        notes: 'can engage',
      },
      { onConflict: 'guild_id,event_id,discord_id' },
    )
  })

  it('does not send a local guild account through Discord-member verification again', async () => {
    const { query } = createEventQuery({
      id: 'event-1',
      status: 'published',
      battle_started_at: null,
      tentative_snapshot_version_id: null,
    })
    const upsert = vi.fn().mockResolvedValue({ error: null })
    const from = vi.fn((table: string) => {
      if (table === 'events') return query
      if (table === 'event_tentative_signups') return { upsert }
      throw new Error(`unexpected table: ${table}`)
    })

    mocks.getSession.mockResolvedValue({
      discordId: 'local:account-1',
      username: 'Local character',
      isAdmin: false,
      isMember: true,
      isGuest: false,
      isLocalGuildAccount: true,
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAlbionEventAccessGateState.mockResolvedValue({
      memberEventAccessAllowed: true,
      memberOnboardingRequired: false,
      memberEventVerificationRequired: false,
      allianceEventAllowed: false,
    })
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(submitMyTentativeSignup('event-1', ['EngageDps'])).resolves.toEqual({})

    expect(mocks.getAlbionEventAccessGateState).toHaveBeenCalledWith({
      discordId: 'local:account-1',
      guildId: 'guild-1',
      isAdmin: false,
      isMember: false,
    })
    expect(upsert).toHaveBeenCalledOnce()
  })

  it('blocks an unverified member from tentative signup when event access requires Albion verification', async () => {
    const from = vi.fn(() => {
      throw new Error('event lookup should not run')
    })

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
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(submitMyTentativeSignup('event-1', ['EngageDps'])).resolves.toEqual({
      error: 'albionVerificationRequired',
    })
  })

  it('blocks a reset member from tentative signup even when unverified access is otherwise allowed', async () => {
    const from = vi.fn(() => {
      throw new Error('event lookup should not run')
    })

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
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(submitMyTentativeSignup('event-1', ['EngageDps'])).resolves.toEqual({
      error: 'albionVerificationRequired',
    })
  })

  it('does not let a former event creator remove someone else from tentative signups', async () => {
    const { query } = createEventQuery({
      id: 'event-1',
      created_by: 'owner-1',
      status: 'published',
      battle_started_at: null,
      tentative_snapshot_version_id: null,
    })
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
    const { query, calls } = createEventQuery({
      id: 'event-1',
      created_by: 'owner-1',
      status: 'published',
      battle_started_at: null,
      tentative_snapshot_version_id: null,
    })
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
      {
        method: 'select',
        args: ['id, title, created_by, status'],
      },
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

  it('allows an admin proxy write after operational start', async () => {
    const { query } = createEventQuery({
      id: 'event-1',
      created_by: 'admin-1',
      status: 'published',
      battle_started_at: '2026-07-29T00:00:00.000Z',
      tentative_snapshot_version_id: 'snapshot-1',
    })
    const upsert = vi.fn().mockResolvedValue({ error: null })
    mocks.getSession.mockResolvedValue({
      discordId: 'admin-1',
      username: 'Admin',
      isAdmin: true,
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({
      from: vi.fn((table: string) =>
        table === 'events' ? query : { upsert },
      ),
    })

    await expect(
      adminUpsertTentativeSignup(
        'event-1',
        'member-1',
        'Member',
        ['Healer'],
      ),
    ).resolves.toEqual({})
    expect(upsert).toHaveBeenCalledOnce()
  })

  it('lets an event manager recommend a tenant-scoped slot through the atomic RPC', async () => {
    const { query } = createEventQuery({
      id: 'event-1',
      title: 'Reset day',
      created_by: 'owner-1',
      status: 'published',
    })
    const { query: signupQuery } = createEventQuery({ recommended_slot_id: null })
    const rpc = vi.fn().mockResolvedValue({ error: null })
    mocks.getSession.mockResolvedValue({
      discordId: 'manager-1',
      username: 'Manager',
      isAdmin: false,
    })
    mocks.sessionHas.mockReturnValue(true)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'events') return query
        if (table === 'event_tentative_signups') return signupQuery
        throw new Error(`unexpected table: ${table}`)
      }),
      rpc,
    })

    await expect(
      setTentativeSlotRecommendation('event-1', 'member-1', 'slot-1'),
    ).resolves.toEqual({})
    expect(rpc).toHaveBeenCalledWith('set_event_tentative_slot_recommendation', {
      p_guild_id: 'guild-1',
      p_event_id: 'event-1',
      p_discord_id: 'member-1',
      p_slot_id: 'slot-1',
      p_actor_discord_id: 'manager-1',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/events/event-1')
    expect(mocks.after).toHaveBeenCalledOnce()
    const notify = mocks.after.mock.calls[0]?.[0] as (() => Promise<void>) | undefined
    await notify?.()
    expect(mocks.sendTentativeSlotRecommendationNotification).toHaveBeenCalledWith({
      guildId: 'guild-1',
      eventId: 'event-1',
      eventTitle: 'Reset day',
      discordId: 'member-1',
      slotId: 'slot-1',
    })
  })

  it('does not rewrite or notify when the same recommendation is selected again', async () => {
    const { query } = createEventQuery({
      id: 'event-1',
      title: 'Reset day',
      created_by: 'owner-1',
      status: 'published',
    })
    const { query: signupQuery } = createEventQuery({ recommended_slot_id: 'slot-1' })
    const rpc = vi.fn()
    mocks.getSession.mockResolvedValue({
      discordId: 'manager-1',
      username: 'Manager',
      isAdmin: true,
    })
    mocks.sessionHas.mockReturnValue(true)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({
      from: vi.fn((table: string) =>
        table === 'events' ? query : signupQuery,
      ),
      rpc,
    })

    await expect(
      setTentativeSlotRecommendation('event-1', 'member-1', 'slot-1'),
    ).resolves.toEqual({})
    expect(rpc).not.toHaveBeenCalled()
    expect(mocks.after).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it('blocks a non-manager from recommending a slot', async () => {
    const { query } = createEventQuery({
      id: 'event-1',
      created_by: 'owner-1',
      status: 'published',
    })
    const rpc = vi.fn()
    mocks.getSession.mockResolvedValue({
      discordId: 'member-2',
      username: 'Member',
      isAdmin: false,
      canCreateEvents: false,
    })
    mocks.sessionHas.mockReturnValue(false)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({ from: vi.fn(() => query), rpc })

    await expect(
      setTentativeSlotRecommendation('event-1', 'member-1', 'slot-1'),
    ).resolves.toEqual({ error: 'notAuthorized' })
    expect(rpc).not.toHaveBeenCalled()
  })
})
