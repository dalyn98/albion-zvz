import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  getSession: vi.fn(),
  sessionHas: vi.fn(),
  getSessionGuildId: vi.fn(),
  canUseAllianceEventFeaturesForSession: vi.fn(),
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

vi.mock('@/lib/auth', () => ({
  requireCurrentMutationSession: mocks.getSession,
  requireEventCreatorForEvent: vi.fn(),
}))

vi.mock('@/lib/event-permissions', () => ({
  sessionCanCreateOrManageEvents: vi.fn(() => false),
}))

vi.mock('@/lib/albion-identity', () => ({
  canUseAllianceEventFeaturesForSession: mocks.canUseAllianceEventFeaturesForSession,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

import { cancelBuildSheetApplication, submitBuildSheetApplication } from './build-sheet'

interface QueryCall {
  method: string
  args: unknown[]
}

interface Query {
  select: (columns: string) => Query
  eq: (column: string, value: unknown) => Query
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>
}

interface ResolvedQuery extends PromiseLike<{ data: unknown; error: { message: string } | null }> {
  select: (columns: string) => ResolvedQuery
  eq: (column: string, value: unknown) => ResolvedQuery
  in: (column: string, values: unknown[]) => ResolvedQuery
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>
}

function createEventQuery(data: unknown): { query: Query; calls: QueryCall[] } {
  const calls: QueryCall[] = []
  const query: Query = {
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

function createResolvedQuery(
  data: unknown,
): { query: ResolvedQuery; calls: QueryCall[] } {
  const calls: QueryCall[] = []
  const result = { data, error: null }
  const query: ResolvedQuery = {
    select: (columns) => {
      calls.push({ method: 'select', args: [columns] })
      return query
    },
    eq: (column, value) => {
      calls.push({ method: 'eq', args: [column, value] })
      return query
    },
    in: (column, values) => {
      calls.push({ method: 'in', args: [column, values] })
      return query
    },
    maybeSingle: () => {
      calls.push({ method: 'maybeSingle', args: [] })
      return Promise.resolve(result)
    },
    then: (onfulfilled, onrejected) =>
      Promise.resolve(result).then(onfulfilled, onrejected),
  }
  return { query, calls }
}

describe('build-sheet application access', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
    mocks.getSession.mockReset()
    mocks.sessionHas.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.canUseAllianceEventFeaturesForSession.mockReset()
    mocks.revalidatePath.mockReset()
  })

  it('blocks event-scoped guests from applying to a different build-sheet event', async () => {
    const { query } = createEventQuery({
      id: 'event-2',
      guild_id: 'guild-1',
      created_by: 'owner-1',
      recruitment_mode: 'build_sheet',
      status: 'published',
      battle_started_at: null,
    })
    const from = vi.fn((table: string) => {
      if (table === 'events') return query
      throw new Error(`unexpected table: ${table}`)
    })

    mocks.getSession.mockResolvedValue({
      discordId: 'guest-1',
      username: 'Guest',
      isMember: false,
      isAdmin: false,
      isGuest: true,
      eventScope: 'event-1',
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.canUseAllianceEventFeaturesForSession.mockResolvedValue(false)
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(submitBuildSheetApplication('event-2', 'EngageDps', ['template-1'])).resolves.toEqual({
      error: 'errors.guestWrongEvent',
    })
  })

  it('blocks event-scoped guests from cancelling applications outside their event scope', async () => {
    const from = vi.fn(() => {
      throw new Error('application lookup should not run')
    })

    mocks.getSession.mockResolvedValue({
      discordId: 'guest-1',
      username: 'Guest',
      isMember: false,
      isAdmin: false,
      isGuest: true,
      eventScope: 'event-1',
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(cancelBuildSheetApplication('event-2')).resolves.toEqual({
      error: 'errors.guestWrongEvent',
    })
  })

  it('keeps a valid preference application pending for an operator assignment', async () => {
    const { query: eventQuery } = createEventQuery({
      id: 'event-1',
      guild_id: 'guild-1',
      created_by: 'owner-1',
      recruitment_mode: 'build_sheet',
      status: 'published',
      battle_started_at: null,
    })
    const { query: existingQuery } = createResolvedQuery(null)
    const { query: demandQuery } = createResolvedQuery([{ required_count: 1 }])
    const { query: templateQuery } = createResolvedQuery([
      {
        id: 'template-1',
        name: 'Engage build',
        data: {
          role_name: 'EngageDps',
          weapon_name: 'Grovekeeper',
          weapon_id: 'T8_MAIN_MACE_MORGANA',
        },
        role_type: 'EngageDps',
      },
    ])
    const upsert = vi.fn(async () => ({ data: null, error: null }))
    const tables: string[] = []
    const from = vi.fn((table: string) => {
      tables.push(table)
      if (table === 'events') return eventQuery
      if (table === 'event_build_applications') {
        return tables.filter((name) => name === table).length === 1
          ? existingQuery
          : { upsert }
      }
      if (table === 'event_build_role_demands') return demandQuery
      if (table === 'slot_templates') return templateQuery
      throw new Error(`unexpected table: ${table}`)
    })

    mocks.getSession.mockResolvedValue({
      discordId: 'member-1',
      username: 'Member',
      isMember: true,
      isAdmin: false,
      isGuest: false,
      eventScope: null,
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.canUseAllianceEventFeaturesForSession.mockResolvedValue(false)
    mocks.getAdminClient.mockReturnValue({ from })

    await expect(
      submitBuildSheetApplication('event-1', 'EngageDps', ['template-1']),
    ).resolves.toEqual({})

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        guild_id: 'guild-1',
        event_id: 'event-1',
        applicant_discord_id: 'member-1',
        role_type: 'EngageDps',
        status: 'pending',
        assigned_party_number: null,
        assigned_slot_id: null,
        assigned_by: null,
      }),
      { onConflict: 'guild_id,event_id,applicant_discord_id' },
    )
    expect(tables).not.toContain('slots')
  })
})
