import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getTranslations: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  getAdminClient: vi.fn(),
  sessionCanCreateOrManageEvents: vi.fn(),
  sessionHas: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
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

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/event-permissions', () => ({
  sessionCanCreateOrManageEvents: mocks.sessionCanCreateOrManageEvents,
}))

import {
  removeEventRegearParticipant,
  upsertEventRegearParticipant,
} from './event-regear-participants'

interface QueryCall {
  method: string
  args: unknown[]
}

interface QueryResult {
  data?: unknown
  error?: { message: string } | null
}

function createQuery(result: QueryResult, calls: QueryCall[]) {
  const query = {
    select(columns: string) {
      calls.push({ method: 'select', args: [columns] })
      return query
    },
    upsert(payload: Record<string, unknown>, options?: Record<string, unknown>) {
      calls.push({ method: 'upsert', args: [payload, options] })
      return Promise.resolve(result)
    },
    delete() {
      calls.push({ method: 'delete', args: [] })
      return query
    },
    eq(column: string, value: unknown) {
      calls.push({ method: 'eq', args: [column, value] })
      return query
    },
    maybeSingle() {
      calls.push({ method: 'maybeSingle', args: [] })
      return Promise.resolve(result)
    },
    then(resolve: (value: QueryResult) => void, reject?: (reason: unknown) => void) {
      return Promise.resolve(result).then(resolve, reject)
    },
  }
  return query
}

function createDb(options: {
  event?: Record<string, unknown> | null
  member?: Record<string, unknown> | null
}) {
  const callsByTable = new Map<string, QueryCall[]>()
  const from = vi.fn((table: string) => {
    const calls: QueryCall[] = []
    callsByTable.set(table, calls)
    if (table === 'events') {
      return createQuery({ data: options.event ?? null, error: null }, calls)
    }
    if (table === 'guild_avatars') {
      return createQuery({ data: options.member ?? null, error: null }, calls)
    }
    if (table === 'event_regear_participants') {
      return createQuery({ data: null, error: null }, calls)
    }
    throw new Error(`Unexpected table: ${table}`)
  })
  return { db: { from }, callsByTable }
}

describe('event regear participants actions', () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset()
    mocks.getTranslations.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.getAdminClient.mockReset()
    mocks.sessionCanCreateOrManageEvents.mockReset()
    mocks.sessionHas.mockReset()

    mocks.getTranslations.mockResolvedValue((key: string) => key)
    mocks.getSession.mockResolvedValue({
      discordId: 'creator-1',
      username: 'Creator',
      isAdmin: false,
      canCreateEvents: true,
      eventCreatorCategories: ['FF', '갱킹'],
      capabilities: '0',
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.sessionCanCreateOrManageEvents.mockReturnValue(true)
    mocks.sessionHas.mockReturnValue(false)
  })

  it('lets the event creator add a non-combat regear participant', async () => {
    const { db, callsByTable } = createDb({
      event: { id: 'event-1', category: 'FF', created_by: 'creator-1' },
      member: { discord_id: 'member-1', username: 'Member One', withdrawn_at: null },
    })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(
      upsertEventRegearParticipant('event-1', 'member-1', 'Healer'),
    ).resolves.toEqual({})

    expect(callsByTable.get('event_regear_participants')).toContainEqual({
      method: 'upsert',
      args: [
        {
          guild_id: 'guild-1',
          event_id: 'event-1',
          discord_id: 'member-1',
          username: 'Member One',
          role_name: 'Healer',
          added_by: 'creator-1',
          added_by_username: 'Creator',
        },
        { onConflict: 'guild_id,event_id,discord_id' },
      ],
    })
  })

  it('lets the event creator remove a non-combat regear participant', async () => {
    const { db, callsByTable } = createDb({
      event: { id: 'event-1', category: '갱킹', created_by: 'creator-1' },
      member: null,
    })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(removeEventRegearParticipant('event-1', 'member-1')).resolves.toEqual({})

    expect(callsByTable.get('event_regear_participants')).toEqual([
      { method: 'delete', args: [] },
      { method: 'eq', args: ['guild_id', 'guild-1'] },
      { method: 'eq', args: ['event_id', 'event-1'] },
      { method: 'eq', args: ['discord_id', 'member-1'] },
    ])
  })

  it('blocks non-owner event creators from changing the participant list', async () => {
    const { db, callsByTable } = createDb({
      event: { id: 'event-1', category: 'FF', created_by: 'someone-else' },
      member: { discord_id: 'member-1', username: 'Member One', withdrawn_at: null },
    })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(
      upsertEventRegearParticipant('event-1', 'member-1', 'Healer'),
    ).resolves.toEqual({ error: 'notAuthorized' })

    expect(callsByTable.has('event_regear_participants')).toBe(false)
  })

  it('keeps combat events out of the regear participant list flow', async () => {
    const { db, callsByTable } = createDb({
      event: { id: 'event-1', category: '전투', created_by: 'creator-1' },
      member: { discord_id: 'member-1', username: 'Member One', withdrawn_at: null },
    })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(
      upsertEventRegearParticipant('event-1', 'member-1', 'Healer'),
    ).resolves.toEqual({ error: 'combatNotAllowed' })

    expect(callsByTable.has('event_regear_participants')).toBe(false)
  })
})
