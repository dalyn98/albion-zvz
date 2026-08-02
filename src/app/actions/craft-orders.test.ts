import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAP } from '@/lib/permissions'

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  requireAnyCapability: vi.fn(),
  getAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
  sendLocalizedDiscordDmToUser: vi.fn(),
  autoTrackSuffixesFromItemIds: vi.fn(),
  sendAdminNotification: vi.fn(),
  syncDiscordAdminApprovalNotification: vi.fn(),
  resolveStableMemberOwnership: vi.fn(),
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
  requireCurrentMutationSession: mocks.getSession,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/discord-dm-localized', () => ({
  sendLocalizedDiscordDmToUser: mocks.sendLocalizedDiscordDmToUser,
}))

vi.mock('@/lib/inventory', () => ({
  autoTrackSuffixesFromItemIds: mocks.autoTrackSuffixesFromItemIds,
}))

vi.mock('@/lib/admin-notifications', () => ({
  sendAdminNotification: mocks.sendAdminNotification,
}))

vi.mock('@/lib/discord-admin-approvals', () => ({
  syncDiscordAdminApprovalNotification: mocks.syncDiscordAdminApprovalNotification,
}))

vi.mock('@/lib/stable-member-ownership', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/stable-member-ownership')>()),
  resolveStableMemberOwnership: mocks.resolveStableMemberOwnership,
}))

import {
  approveCraftOrderTaskAdmin,
  claimCraftOrder,
  listCraftOrders,
  listOpenCraftOrdersForMember,
  postCraftOrderAdmin,
} from './craft-orders'

interface QueryCall {
  method: string
  args: unknown[]
}

interface QueryResult {
  data?: unknown[]
  error?: { message: string } | null
}

function createQuery(result: QueryResult, calls: QueryCall[] = []) {
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
    limit(count: number) {
      calls.push({ method: 'limit', args: [count] })
      return query
    },
    then(resolve: (value: QueryResult) => void, reject?: (reason: unknown) => void) {
      return Promise.resolve(result).then(resolve, reject)
    },
  }
  return query
}

function createListDb(options: {
  orders?: unknown[]
  tasks?: unknown[]
  orderCalls?: QueryCall[]
  taskCalls?: QueryCall[]
} = {}) {
  const orderCalls = options.orderCalls ?? []
  const taskCalls = options.taskCalls ?? []
  const orderQuery = createQuery({ data: options.orders ?? [], error: null }, orderCalls)
  const taskQuery = createQuery({ data: options.tasks ?? [], error: null }, taskCalls)
  const from = vi.fn((table: string) => {
    if (table === 'craft_orders') return orderQuery
    if (table === 'craft_tasks') return taskQuery
    throw new Error(`Unexpected table: ${table}`)
  })
  return { db: { from }, from, orderCalls, taskCalls }
}

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    item_id: 'T4_BAG',
    item_name: 'Bag',
    quantity: 10,
    unit_price_silver: 100,
    notes: null,
    status: 'open',
    posted_by_discord_id: 'admin-1',
    posted_by_username: 'Admin',
    created_at: '2026-01-01T00:00:00.000Z',
    closed_at: null,
    cancelled_at: null,
    ...overrides,
  }
}

function taskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    craft_order_id: 'order-1',
    status: 'claimed',
    crafter_discord_id: 'member-1',
    crafter_guild_member_id: 'member-record-1',
    crafter_username: 'Member One',
    order_quantity: 2,
    box_number: null,
    craft_city: null,
    reimbursement_silver: null,
    claimed_at: '2026-01-01T01:00:00.000Z',
    delivered_at: null,
    collected_at: null,
    cancelled_at: null,
    ...overrides,
  }
}

function resetCraftOrderMocks() {
  mocks.getTranslations.mockReset()
  mocks.getSession.mockReset()
  mocks.getSessionGuildId.mockReset()
  mocks.requireAnyCapability.mockReset()
  mocks.getAdminClient.mockReset()
  mocks.revalidatePath.mockReset()
  mocks.sendLocalizedDiscordDmToUser.mockReset()
  mocks.autoTrackSuffixesFromItemIds.mockReset()
  mocks.sendAdminNotification.mockReset()
  mocks.syncDiscordAdminApprovalNotification.mockReset()
  mocks.resolveStableMemberOwnership.mockReset()

  mocks.getTranslations.mockResolvedValue((key: string) => key)
  mocks.getSessionGuildId.mockResolvedValue('guild-1')
  mocks.resolveStableMemberOwnership.mockResolvedValue({
    guildMemberId: 'member-record-1',
  })
}

describe('craft order reads', () => {
  beforeEach(() => {
    resetCraftOrderMocks()
  })

  it('requires craft admin capabilities before listing all craft orders', async () => {
    const { db } = createListDb()
    mocks.requireAnyCapability.mockResolvedValue(db)
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1', isMember: true })

    await expect(listCraftOrders()).resolves.toEqual({ orders: [] })

    expect(mocks.requireAnyCapability).toHaveBeenCalledWith([
      CAP.CRAFT_TASK_CREATE,
      CAP.CRAFT_TASK_DELIVER,
      CAP.CRAFT_MASTER,
    ])
  })

  it('returns all task details only for the admin craft order list', async () => {
    const { db } = createListDb({
      orders: [orderRow()],
      tasks: [
        taskRow({ id: 'mine', crafter_discord_id: 'member-1', order_quantity: 2 }),
        taskRow({ id: 'other', crafter_discord_id: 'member-2', crafter_username: 'Other', order_quantity: 3 }),
      ],
    })
    mocks.requireAnyCapability.mockResolvedValue(db)
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1', isMember: true })

    const result = await listCraftOrders()

    expect(result.orders).toHaveLength(1)
    expect(result.orders[0].order.claimedQuantity).toBe(5)
    expect(result.orders[0].tasks.map((task) => task.taskId)).toEqual(['mine', 'other'])
  })

  it('rejects member craft order reads for non-members', async () => {
    mocks.getSession.mockResolvedValue({ discordId: 'guest-1', isMember: false })

    await expect(listOpenCraftOrdersForMember()).resolves.toEqual({
      orders: [],
      error: 'unauthorized',
    })
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it('lists only open orders and only the current member active tasks', async () => {
    const orderCalls: QueryCall[] = []
    const taskCalls: QueryCall[] = []
    const { db } = createListDb({
      orderCalls,
      taskCalls,
      orders: [orderRow()],
      tasks: [
        taskRow({ id: 'mine-claimed', crafter_discord_id: 'member-1', order_quantity: 2 }),
        taskRow({ id: 'mine-delivered', status: 'delivered', crafter_discord_id: 'member-1', order_quantity: 1 }),
        taskRow({ id: 'mine-approved', status: 'approved', crafter_discord_id: 'member-1', order_quantity: 4 }),
        taskRow({
          id: 'other-claimed',
          crafter_discord_id: 'member-2',
          crafter_guild_member_id: 'member-record-2',
          order_quantity: 3,
        }),
      ],
    })
    mocks.getAdminClient.mockReturnValue(db)
    mocks.getSession.mockResolvedValue({ discordId: 'member-1', isMember: true })

    const result = await listOpenCraftOrdersForMember()

    expect(orderCalls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
    expect(orderCalls).toContainEqual({ method: 'eq', args: ['status', 'open'] })
    expect(taskCalls).toContainEqual({ method: 'eq', args: ['guild_id', 'guild-1'] })
    expect(result.orders).toHaveLength(1)
    expect(result.orders[0].order.claimedQuantity).toBe(10)
    expect(result.orders[0].order.fulfilledQuantity).toBe(4)
    expect(result.orders[0].tasks.map((task) => task.taskId)).toEqual([
      'mine-claimed',
      'mine-delivered',
    ])
  })
})

describe('craft order mutations', () => {
  beforeEach(() => {
    resetCraftOrderMocks()
  })

  it('syncs a successful site approval to the original Discord notification', async () => {
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          crafter_discord_id: 'member-1',
          order_quantity: 2,
          craft_order_id: 'order-1',
          craft_orders: {
            item_name: 'Bag',
            item_id: 'T4_BAG',
            unit_price_silver: 100,
          },
        },
        error: null,
      }),
    }
    query.select.mockReturnValue(query)
    query.eq.mockReturnValue(query)
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1', username: 'Admin' })
    mocks.requireAnyCapability.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn(() => query),
    })

    await expect(approveCraftOrderTaskAdmin('task-1')).resolves.toEqual({})

    expect(mocks.syncDiscordAdminApprovalNotification).toHaveBeenCalledWith({
      actor: { guildId: 'guild-1', discordId: 'admin-1', username: 'Admin' },
      kind: 'craft',
      sourceId: 'task-1',
      resolution: 'approved',
    })
  })

  it('rejects craft order quantities and payouts outside persisted integer bounds', async () => {
    const rpc = vi.fn()
    const db = { rpc }
    mocks.requireAnyCapability.mockResolvedValue(db)
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1', username: 'Admin' })

    await expect(
      postCraftOrderAdmin({
        itemId: 'T4_BAG',
        itemName: 'Bag',
        quantity: 2147483648,
        unitPriceSilver: 1,
        notes: null,
      }),
    ).resolves.toEqual({ error: 'craftOrderQuantityInvalid' })

    await expect(
      postCraftOrderAdmin({
        itemId: 'T4_BAG',
        itemName: 'Bag',
        quantity: 2,
        unitPriceSilver: 1073741824,
        notes: null,
      }),
    ).resolves.toEqual({ error: 'craftOrderPriceInvalid' })

    expect(rpc).not.toHaveBeenCalled()
  })

  it('rejects invalid member claim quantities before calling the claim rpc', async () => {
    const rpc = vi.fn()
    mocks.getAdminClient.mockReturnValue({ rpc })
    mocks.getSession.mockResolvedValue({ discordId: 'member-1', username: 'Member' })

    await expect(
      claimCraftOrder({
        orderId: 'order-1',
        quantity: 2147483648,
      }),
    ).resolves.toEqual({ error: 'craftOrderQuantityInvalid' })

    expect(rpc).not.toHaveBeenCalled()
  })
})
