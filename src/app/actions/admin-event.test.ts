import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  getTranslations: vi.fn(),
  requireEventCreator: vi.fn(),
  requireEventCreatorForEvent: vi.fn(),
  getSession: vi.fn(),
  sessionHas: vi.fn(),
  getSessionGuildId: vi.fn(),
  logError: vi.fn(),
  logAdminAction: vi.fn(),
  logTenantOnboardingEvent: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next/server', () => ({
  after: vi.fn(),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}))

vi.mock('@/lib/auth', () => ({
  requireEventCreator: mocks.requireEventCreator,
  requireEventCreatorForEvent: mocks.requireEventCreatorForEvent,
}))

vi.mock('@/lib/event-permissions', () => ({
  sessionCanCreateEventCategory: vi.fn(() => true),
  sessionCanCreateOrManageEvents: vi.fn(() => true),
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
  sessionHas: mocks.sessionHas,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
  getTenantDiscordConfig: vi.fn(),
}))

vi.mock('@/lib/discord', () => ({
  DiscordChannelMessageError: class DiscordChannelMessageError extends Error {},
  sendEventNotification: vi.fn(),
}))

vi.mock('@/lib/app-settings', () => ({
  getAppSetting: vi.fn(),
}))

vi.mock('@/lib/locale', () => ({
  getLocale: vi.fn(() => 'ko'),
}))

vi.mock('@/lib/timezone-server', () => ({
  getTenantTimezone: vi.fn(() => 'Asia/Seoul'),
}))

vi.mock('@/lib/log', () => ({
  log: {
    error: mocks.logError,
  },
}))

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminAction,
}))

vi.mock('@/lib/tenant-onboarding-events', () => ({
  logTenantOnboardingEvent: mocks.logTenantOnboardingEvent,
}))

import { createDraftEvent, resetBattleStart, updateEvent } from './admin-event'

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
    update(payload: Record<string, unknown>) {
      calls.push({ method: 'update', args: [payload] })
      return query
    },
    insert(payload: Record<string, unknown>) {
      calls.push({ method: 'insert', args: [payload] })
      return query
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
    single() {
      calls.push({ method: 'single', args: [] })
      return Promise.resolve(result)
    },
    then(resolve: (value: QueryResult) => void, reject?: (reason: unknown) => void) {
      return Promise.resolve(result).then(resolve, reject)
    },
  }
  return query
}

function createAdminEventDb(options: {
  currentGatherAt?: string | null
}) {
  const eventsCalls: QueryCall[][] = []
  const dmSentCalls: QueryCall[] = []
  let eventsFromCount = 0
  const from = vi.fn((table: string) => {
    if (table === 'events') {
      const calls: QueryCall[] = []
      eventsCalls.push(calls)
      eventsFromCount += 1
      if (eventsFromCount === 1) {
        return createQuery(
          { data: { gather_at: options.currentGatherAt ?? '2026-01-01T00:00:00.000Z' }, error: null },
          calls,
        )
      }
      return createQuery({ data: null, error: null }, calls)
    }
    if (table === 'event_dm_sent') {
      return createQuery({ data: null, error: null }, dmSentCalls)
    }
    throw new Error(`Unexpected table: ${table}`)
  })
  return { db: { from }, eventsCalls, dmSentCalls }
}

function createDraftDb() {
  const eventsCalls: QueryCall[] = []
  const from = vi.fn((table: string) => {
    if (table !== 'events') throw new Error(`Unexpected table: ${table}`)
    return createQuery({ data: { id: 'event-1' }, error: null }, eventsCalls)
  })
  return { db: { from }, eventsCalls }
}

function eventPayload(overrides: Record<string, unknown> = {}) {
  return {
    title: 'CTA',
    gather_at: '2026-01-02T00:00:00.000Z',
    gather_time: '21:00',
    gather_location: 'Bridgewatch',
    special_notes: null,
    category: '전투' as const,
    recruitment_mode: 'slots' as const,
    ...overrides,
  }
}

describe('admin event notification dedupe resets', () => {
  beforeEach(() => {
    mocks.revalidatePath.mockReset()
    mocks.getTranslations.mockReset()
    mocks.requireEventCreator.mockReset()
    mocks.requireEventCreatorForEvent.mockReset()
    mocks.getSession.mockReset()
    mocks.sessionHas.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.logError.mockReset()
    mocks.logAdminAction.mockReset()
    mocks.logTenantOnboardingEvent.mockReset()

    mocks.getTranslations.mockResolvedValue((key: string) => key)
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1', isAdmin: true })
    mocks.sessionHas.mockReturnValue(false)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
  })

  it('scopes updateEvent DM dedupe clearing by guild when gather time changes', async () => {
    const { db, dmSentCalls } = createAdminEventDb({
      currentGatherAt: '2026-01-01T00:00:00.000Z',
    })
    mocks.requireEventCreatorForEvent.mockResolvedValue(db)

    await expect(updateEvent('event-1', eventPayload())).resolves.toEqual({})

    expect(dmSentCalls).toContainEqual({ method: 'delete', args: [] })
    expect(dmSentCalls).toContainEqual({ method: 'eq', args: ['event_id', 'event-1'] })
    expect(dmSentCalls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
  })

  it('scopes resetBattleStart DM dedupe clearing by guild', async () => {
    const { db, dmSentCalls } = createAdminEventDb({
      currentGatherAt: null,
    })
    mocks.requireEventCreatorForEvent.mockResolvedValue(db)

    await expect(resetBattleStart('event-1')).resolves.toEqual({})

    expect(dmSentCalls).toContainEqual({ method: 'delete', args: [] })
    expect(dmSentCalls).toContainEqual({ method: 'eq', args: ['event_id', 'event-1'] })
    expect(dmSentCalls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
  })

  it('forces delegated event creators to create FF drafts with the default regear policy', async () => {
    const { db, eventsCalls } = createDraftDb()
    mocks.requireEventCreator.mockResolvedValue(db)
    mocks.getSession.mockResolvedValue({
      discordId: 'creator-1',
      isAdmin: false,
      canCreateEvents: true,
      eventCreatorCategories: ['FF'],
      capabilities: '0',
    })

    await expect(
      createDraftEvent({
        title: 'FF fame farm',
        category: 'FF',
        recruitmentMode: 'slots',
        regear_policy: 'event',
        regear_silver_cap: 300000,
        regear_max_deaths_per_member: 2,
        regear_video_policy: 'custom',
        regear_video_payout_rate_percent: 95,
        regear_video_claim_ceiling_bonus_silver: 500000,
        regear_auto_policy: 'disabled',
      }),
    ).resolves.toEqual({ id: 'event-1' })

    const insertPayload = eventsCalls.find((call) => call.method === 'insert')?.args[0]
    expect(insertPayload).toMatchObject({
      regear_policy: 'role',
      regear_silver_cap: null,
      regear_max_deaths_per_member: null,
      regear_video_policy: 'inherit',
      regear_video_payout_rate_percent: null,
      regear_video_claim_ceiling_bonus_silver: null,
      regear_auto_policy: 'inherit',
    })
    expect(mocks.logTenantOnboardingEvent).toHaveBeenCalledWith({
      guildId: 'guild-1',
      actorDiscordId: 'creator-1',
      eventType: 'first_event_created',
      details: {
        eventId: 'event-1',
        title: 'FF fame farm',
        category: 'FF',
        recruitmentMode: 'slots',
      },
    })
  })

  it('does not let delegated event editors change FF regear policy on update', async () => {
    const { db, eventsCalls } = createAdminEventDb({
      currentGatherAt: '2026-01-02T00:00:00.000Z',
    })
    mocks.requireEventCreatorForEvent.mockResolvedValue(db)
    mocks.getSession.mockResolvedValue({
      discordId: 'creator-1',
      isAdmin: false,
      canCreateEvents: true,
      eventCreatorCategories: ['FF'],
      capabilities: '0',
    })

    await expect(
      updateEvent(
        'event-1',
        eventPayload({
          category: 'FF',
          regear_policy: 'event',
          regear_silver_cap: 300000,
          regear_max_deaths_per_member: 2,
        }),
      ),
    ).resolves.toEqual({})

    const updatePayload = eventsCalls.flat().find((call) => call.method === 'update')?.args[0]
    expect(updatePayload).not.toHaveProperty('regear_policy')
    expect(updatePayload).not.toHaveProperty('regear_silver_cap')
    expect(updatePayload).not.toHaveProperty('regear_max_deaths_per_member')
    expect(updatePayload).not.toHaveProperty('regear_video_policy')
    expect(updatePayload).not.toHaveProperty('regear_auto_policy')
  })

  it('lets regear price editors update event regear policy', async () => {
    const { db, eventsCalls } = createAdminEventDb({
      currentGatherAt: '2026-01-02T00:00:00.000Z',
    })
    mocks.requireEventCreatorForEvent.mockResolvedValue(db)
    mocks.getSession.mockResolvedValue({
      discordId: 'regear-1',
      isAdmin: false,
      canCreateEvents: true,
      eventCreatorCategories: ['전투'],
      capabilities: '0',
    })
    mocks.sessionHas.mockReturnValue(true)

    await expect(
      updateEvent(
        'event-1',
        eventPayload({
          category: '전투',
          regear_policy: 'event',
          regear_silver_cap: 300000,
          regear_max_deaths_per_member: 2,
          regear_video_policy: 'custom',
          regear_video_payout_rate_percent: 95,
          regear_video_claim_ceiling_bonus_silver: 500000,
          regear_auto_policy: 'disabled',
        }),
      ),
    ).resolves.toEqual({})

    const updatePayload = eventsCalls.flat().find((call) => call.method === 'update')?.args[0]
    expect(updatePayload).toMatchObject({
      regear_policy: 'event',
      regear_silver_cap: 300000,
      regear_max_deaths_per_member: 2,
      regear_video_policy: 'custom',
      regear_video_payout_rate_percent: 95,
      regear_video_claim_ceiling_bonus_silver: 500000,
      regear_auto_policy: 'disabled',
    })
  })
})
