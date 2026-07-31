import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  requireAnyCapability: vi.fn(),
  revalidatePath: vi.fn(),
  logAdminAction: vi.fn(),
  getCraftConfig: vi.fn(),
  moveSupplyCraftBox: vi.fn(),
  returnUnclaimedSupplyCraft: vi.fn(),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/auth', () => ({
  requireAnyCapability: mocks.requireAnyCapability,
}))

vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminAction,
}))

vi.mock('@/lib/discord-dm-localized', () => ({
  sendLocalizedDiscordDmToUser: vi.fn(),
}))

vi.mock('@/lib/craft-tasks', () => ({
  cancelCraftTask: vi.fn(),
  convertCraftTaskToSilver: vi.fn(),
  moveSupplyCraftBox: mocks.moveSupplyCraftBox,
  returnUnclaimedSupplyCraft: mocks.returnUnclaimedSupplyCraft,
}))

vi.mock('@/app/actions/craft', () => ({
  getCraftConfig: mocks.getCraftConfig,
}))

import { CAP } from '@/lib/permissions'
import {
  listAllCraftTasksAdmin,
  moveCraftBoxAdmin,
  returnUnclaimedCraftAdmin,
} from './craft-admin'

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
    or(filter: string) {
      calls.push({ method: 'or', args: [filter] })
      return query
    },
    order(column: string, options: Record<string, unknown>) {
      calls.push({ method: 'order', args: [column, options] })
      return query
    },
    limit(count: number) {
      calls.push({ method: 'limit', args: [count] })
      return query
    },
    range(from: number, to: number) {
      calls.push({ method: 'range', args: [from, to] })
      return Promise.resolve(result)
    },
    then(resolve: (value: QueryResult) => void, reject?: (reason: unknown) => void) {
      return Promise.resolve(result).then(resolve, reject)
    },
  }
  return query
}

function craftTaskRow() {
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
  }
}

function createDb() {
  const taskCalls: QueryCall[] = []
  const eventCalls: QueryCall[] = []
  const supplyCalls: QueryCall[] = []
  const taskQuery = createQuery({ data: [craftTaskRow()], error: null }, taskCalls)
  const eventQuery = createQuery(
    { data: [{ id: 'event-1', gather_at: '2026-01-02T00:00:00.000Z' }], error: null },
    eventCalls,
  )
  const supplyQuery = createQuery({ data: [], error: null }, supplyCalls)
  const from = vi.fn((table: string) => {
    if (table === 'craft_tasks') return taskQuery
    if (table === 'events') return eventQuery
    if (table === 'supply_fulfillments') return supplyQuery
    throw new Error(`Unexpected table: ${table}`)
  })
  return { db: { from }, taskCalls, eventCalls, supplyCalls }
}

describe('listAllCraftTasksAdmin', () => {
  beforeEach(() => {
    mocks.getTranslations.mockReset()
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.requireAnyCapability.mockReset()
    mocks.revalidatePath.mockReset()
    mocks.logAdminAction.mockReset()
    mocks.getCraftConfig.mockReset()
    mocks.moveSupplyCraftBox.mockReset()
    mocks.returnUnclaimedSupplyCraft.mockReset()

    mocks.getTranslations.mockResolvedValue((key: string) => key)
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1', isAdmin: true })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
  })

  it('requires delivery or master capability to move custody', async () => {
    mocks.requireAnyCapability.mockResolvedValue({})

    await expect(moveCraftBoxAdmin('task-1', 4, 'operation-1')).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([
      CAP.CRAFT_TASK_DELIVER,
      CAP.CRAFT_MASTER,
    ])
    expect(mocks.moveSupplyCraftBox).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1', guildId: 'guild-1', boxNumber: 4 }),
    )
  })

  it('requires craft master capability to return unclaimed custody', async () => {
    mocks.requireAnyCapability.mockResolvedValue({})

    await expect(
      returnUnclaimedCraftAdmin('task-1', 'unclaimed', 'operation-2'),
    ).resolves.toEqual({})

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([CAP.CRAFT_MASTER])
    expect(mocks.returnUnclaimedSupplyCraft).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1', guildId: 'guild-1', reason: 'unclaimed' }),
    )
  })

  it('scopes admin task event enrichment by the current guild', async () => {
    const { db, eventCalls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await expect(listAllCraftTasksAdmin()).resolves.toMatchObject({
      tasks: [{ taskId: 'task-1', gatherAt: '2026-01-02T00:00:00.000Z' }],
    })

    expect(eventCalls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
    expect(eventCalls).toContainEqual({ method: 'in', args: ['id', ['event-1']] })
  })

  it('keeps pending reimbursements visible in the active admin list after pickup or expiry', async () => {
    const { db, taskCalls } = createDb()
    mocks.requireAnyCapability.mockResolvedValue(db)

    await listAllCraftTasksAdmin('active')

    expect(taskCalls).toContainEqual({
      method: 'or',
      args: ['status.in.(queued,claimed,delivered),reimbursement_status.eq.pending'],
    })
    expect(taskCalls).not.toContainEqual({
      method: 'in',
      args: ['status', ['queued', 'claimed', 'delivered']],
    })
  })
})
