import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
  requireLiveSession: vi.fn(),
  sessionHasAny: vi.fn(),
  getSessionGuildId: vi.fn(),
  getAdminClient: vi.fn(),
  loadIsCrafter: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/lib/session', () => ({
  sessionHasAny: mocks.sessionHasAny,
}))

vi.mock('@/lib/auth', () => ({
  requireLiveSession: mocks.requireLiveSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/craft-task-mapping', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/craft-task-mapping')>()
  return {
    ...actual,
    loadIsCrafter: mocks.loadIsCrafter,
  }
})

vi.mock('@/lib/craft-tasks', () => ({
  claimCraftTask: vi.fn(),
  releaseCraftTask: vi.fn(),
  deliverCraftTask: vi.fn(),
}))

vi.mock('@/lib/discord-dm-localized', () => ({
  sendLocalizedDiscordDmToUser: vi.fn(),
}))

vi.mock('@/lib/inventory', () => ({
  decrementBuildForDelivery: vi.fn(),
  extractGearItemIdsFromBuild: vi.fn(() => []),
}))

import { getCraftQueueTaskDetail, listCraftQueueForCrafter } from './craft-queue'

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
    eq(column: string, value: unknown) {
      calls.push({ method: 'eq', args: [column, value] })
      return query
    },
    in(column: string, values: unknown[]) {
      calls.push({ method: 'in', args: [column, values] })
      return query
    },
    order(column: string, options: Record<string, unknown>) {
      calls.push({ method: 'order', args: [column, options] })
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

function craftTaskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    regear_request_id: 'regear-1',
    status: 'queued',
    crafter_discord_id: null,
    crafter_username: null,
    box_number: null,
    craft_city: null,
    material_silver_cost: null,
    premium_silver: null,
    reimbursement_silver: null,
    compensation_mode: null,
    claimed_at: null,
    delivered_at: null,
    collected_at: null,
    expired_at: null,
    cancelled_at: null,
    expires_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    guild_id: 'guild-1',
    regear_requests: {
      id: 'regear-1',
      discord_id: 'member-1',
      username: 'Member One',
      role_name: 'Tank',
      event_id: 'event-1',
      event_title_snapshot: 'Snapshot Title',
      claimed_silver: 100,
      build_snapshot: null,
    },
    ...overrides,
  }
}

function createDb(options: {
  taskData: unknown
  eventData?: unknown
}) {
  const taskCalls: QueryCall[] = []
  const eventCalls: QueryCall[] = []
  const taskQuery = createQuery({ data: options.taskData, error: null }, taskCalls)
  const eventQuery = createQuery({ data: options.eventData ?? [], error: null }, eventCalls)
  const emptyQuery = createQuery({ data: [], error: null }, [])
  const from = vi.fn((table: string) => {
    if (table === 'craft_tasks') return taskQuery
    if (table === 'events') return eventQuery
    if (
      table === 'supply_fulfillments' ||
      table === 'supply_settlement_items' ||
      table === 'guild_inventory_gear'
    ) {
      return emptyQuery
    }
    throw new Error(`Unexpected table: ${table}`)
  })
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
  return { db: { from, rpc }, taskCalls, eventCalls }
}

describe('craft queue event lookups', () => {
  beforeEach(() => {
    mocks.getTranslations.mockReset()
    mocks.requireLiveSession.mockReset()
    mocks.sessionHasAny.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.getAdminClient.mockReset()
    mocks.loadIsCrafter.mockReset()
    mocks.revalidatePath.mockReset()

    mocks.getTranslations.mockResolvedValue((key: string) => key)
    mocks.requireLiveSession.mockResolvedValue({
      discordId: 'crafter-1',
      isAdmin: false,
      capabilities: '0',
    })
    mocks.sessionHasAny.mockReturnValue(false)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.loadIsCrafter.mockResolvedValue(true)
  })

  it('scopes list event enrichment by the current guild', async () => {
    const { db, eventCalls } = createDb({
      taskData: [craftTaskRow()],
      eventData: [{ id: 'event-1', gather_at: '2026-01-02T00:00:00.000Z' }],
    })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(listCraftQueueForCrafter()).resolves.toMatchObject({
      queued: [{ taskId: 'task-1', gatherAt: '2026-01-02T00:00:00.000Z' }],
    })

    expect(eventCalls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
    expect(eventCalls).toContainEqual({ method: 'in', args: ['id', ['event-1']] })
  })

  it('scopes detail event enrichment by the current guild', async () => {
    const { db, eventCalls } = createDb({
      taskData: craftTaskRow({
        status: 'claimed',
        crafter_discord_id: 'crafter-1',
      }),
      eventData: { id: 'event-1', title: 'Live Title', gather_at: '2026-01-02T00:00:00.000Z' },
    })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(getCraftQueueTaskDetail('task-1')).resolves.toMatchObject({
      detail: {
        event: {
          id: 'event-1',
          title: 'Live Title',
          gatherAt: '2026-01-02T00:00:00.000Z',
        },
      },
    })

    expect(eventCalls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
    expect(eventCalls).toContainEqual({ method: 'eq', args: ['id', 'event-1'] })
  })

  it('fails closed when live Discord membership can no longer be resolved', async () => {
    mocks.requireLiveSession.mockRejectedValue(new Error('Unauthorized'))

    await expect(listCraftQueueForCrafter()).resolves.toEqual({
      queued: [],
      mine: [],
      isCrafter: false,
      stockByItemId: {},
      error: 'loginRequired',
    })

    expect(mocks.loadIsCrafter).not.toHaveBeenCalled()
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it.each(['claimed', 'delivered', 'collected', 'expired', 'cancelled'])(
    "does not expose another crafter's %s task to a plain crafter",
    async (status) => {
      const { db, eventCalls } = createDb({
        taskData: craftTaskRow({
          status,
          crafter_discord_id: 'crafter-2',
        }),
      })
      mocks.getAdminClient.mockReturnValue(db)

      await expect(getCraftQueueTaskDetail('task-1')).resolves.toEqual({
        detail: null,
        error: 'craftTaskNotFound',
      })
      expect(eventCalls).toHaveLength(0)
    },
  )

  it("allows a current queue manager to inspect another crafter's task", async () => {
    mocks.sessionHasAny.mockReturnValue(true)
    const { db } = createDb({
      taskData: craftTaskRow({
        status: 'claimed',
        crafter_discord_id: 'crafter-2',
      }),
      eventData: {
        id: 'event-1',
        title: 'Live Title',
        gather_at: '2026-01-02T00:00:00.000Z',
      },
    })
    mocks.getAdminClient.mockReturnValue(db)

    await expect(getCraftQueueTaskDetail('task-1')).resolves.toMatchObject({
      detail: {
        isMine: false,
        task: {
          taskId: 'task-1',
          crafterDiscordId: 'crafter-2',
        },
      },
    })
  })
})
