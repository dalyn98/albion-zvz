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

    await expect(submitBuildSheetApplication('event-2', 'BrawlerDps', ['template-1'])).resolves.toEqual({
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
})
