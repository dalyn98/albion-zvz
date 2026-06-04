'use server'

// Guild orders — 관리자가 임의 아이템을 발주하면 길드원이 일부 수량을 수주해
// 직접 제작·납품, 관리자 승인 시 길드 재고 입고 + 수주자에게 포인트 지급하는
// 흐름. craft.ts (regear-craft 흐름) 와 같은 craft_tasks 테이블을 공유하지만
// task_kind='guild_order' 로 구분된다. 박스 번호 네임스페이스도 공유.

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { requireAnyCapability } from '@/lib/auth'
import { getAdminClient } from '@/lib/supabase-admin'
import { sendDiscordDmToUser } from '@/lib/discord-dm'
import { autoTrackSuffixesFromItemIds } from '@/lib/inventory'
import { CAP } from '@/lib/permissions'
import { sendAdminNotification } from '@/lib/admin-notifications'

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export type CraftOrderStatus = 'open' | 'closed' | 'cancelled'

export type CraftOrderTaskStatus =
  | 'claimed'
  | 'delivered'
  | 'approved'
  | 'rejected'
  | 'cancelled'

export interface CraftOrderRow {
  id: string
  itemId: string
  itemName: string | null
  quantity: number
  fulfilledQuantity: number
  claimedQuantity: number
  unitPriceSilver: number
  notes: string | null
  status: CraftOrderStatus
  postedByDiscordId: string
  postedByUsername: string | null
  createdAt: string
  closedAt: string | null
  cancelledAt: string | null
}

export interface CraftOrderTaskRow {
  taskId: string
  orderId: string
  status: CraftOrderTaskStatus
  crafterDiscordId: string
  crafterUsername: string | null
  orderQuantity: number
  // 박스 시스템 없이 메모만 쓰는 길드도 있어서 box_number 는 null 가능.
  // craft_city 컬럼은 자유 메모로도 재사용 (도시명 + 보관함 위치 등).
  boxNumber: number | null
  deliveryMemo: string | null
  reimbursementSilver: number | null
  claimedAt: string | null
  deliveredAt: string | null
  collectedAt: string | null
  cancelledAt: string | null
}

export interface CraftOrderWithTasks {
  order: CraftOrderRow
  tasks: CraftOrderTaskRow[]
}

interface RawOrderRow {
  id: string
  item_id: string
  item_name: string | null
  quantity: number
  unit_price_silver: number | string
  notes: string | null
  status: string
  posted_by_discord_id: string
  posted_by_username: string | null
  created_at: string
  closed_at: string | null
  cancelled_at: string | null
}

interface RawTaskRow {
  id: string
  craft_order_id: string
  status: string
  crafter_discord_id: string
  crafter_username: string | null
  order_quantity: number
  box_number: number | null
  craft_city: string | null
  reimbursement_silver: number | string | null
  claimed_at: string | null
  delivered_at: string | null
  collected_at: string | null
  cancelled_at: string | null
}

function toBigintNumber(value: number | string | null): number {
  if (value === null) return 0
  if (typeof value === 'number') return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function mapOrder(row: RawOrderRow, tasks: RawTaskRow[]): CraftOrderRow {
  const claimedQuantity = tasks
    .filter(t => t.status === 'claimed' || t.status === 'delivered' || t.status === 'approved')
    .reduce((acc, t) => acc + t.order_quantity, 0)
  const fulfilledQuantity = tasks
    .filter(t => t.status === 'approved')
    .reduce((acc, t) => acc + t.order_quantity, 0)
  return {
    id: row.id,
    itemId: row.item_id,
    itemName: row.item_name,
    quantity: row.quantity,
    fulfilledQuantity,
    claimedQuantity,
    unitPriceSilver: toBigintNumber(row.unit_price_silver),
    notes: row.notes,
    status: (row.status as CraftOrderStatus),
    postedByDiscordId: row.posted_by_discord_id,
    postedByUsername: row.posted_by_username,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    cancelledAt: row.cancelled_at,
  }
}

function mapTask(row: RawTaskRow): CraftOrderTaskRow {
  return {
    taskId: row.id,
    orderId: row.craft_order_id,
    status: row.status as CraftOrderTaskStatus,
    crafterDiscordId: row.crafter_discord_id,
    crafterUsername: row.crafter_username,
    orderQuantity: row.order_quantity,
    boxNumber: row.box_number,
    deliveryMemo: row.craft_city,
    reimbursementSilver:
      row.reimbursement_silver !== null ? toBigintNumber(row.reimbursement_silver) : null,
    claimedAt: row.claimed_at,
    deliveredAt: row.delivered_at,
    collectedAt: row.collected_at,
    cancelledAt: row.cancelled_at,
  }
}

const CRAFT_CREATE_CAPS = [CAP.CRAFT_TASK_CREATE, CAP.CRAFT_MASTER] as const
const CRAFT_REVIEW_CAPS = [CAP.CRAFT_TASK_DELIVER, CAP.CRAFT_MASTER] as const
const CRAFT_ADMIN_CAPS = [
  CAP.CRAFT_TASK_CREATE,
  CAP.CRAFT_TASK_DELIVER,
  CAP.CRAFT_MASTER,
] as const
const POSTGRES_INT_MAX = 2147483647

function isPositivePostgresInt(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= POSTGRES_INT_MAX
}

function isNonNegativePostgresInt(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= POSTGRES_INT_MAX
}

function isValidCraftOrderPayout(quantity: number, unitPriceSilver: number): boolean {
  return quantity * unitPriceSilver <= POSTGRES_INT_MAX
}

// ────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────

interface ListCraftOrdersForGuildOptions {
  orderStatus?: CraftOrderStatus
  visibleTaskOwnerDiscordId?: string
}

async function listCraftOrdersForGuild(
  db: ReturnType<typeof getAdminClient>,
  guildId: string,
  options: ListCraftOrdersForGuildOptions = {},
): Promise<{
  orders: CraftOrderWithTasks[]
  error?: string
}> {
  let orderQuery = db
    .from('craft_orders')
    .select(
      'id, item_id, item_name, quantity, unit_price_silver, notes, status, posted_by_discord_id, posted_by_username, created_at, closed_at, cancelled_at',
    )
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (options.orderStatus) orderQuery = orderQuery.eq('status', options.orderStatus)

  const { data: orderRows, error: orderError } = await orderQuery
  if (orderError) return { orders: [], error: orderError.message }
  const orders = (orderRows ?? []) as RawOrderRow[]
  if (orders.length === 0) return { orders: [] }

  const orderIds = orders.map(o => o.id)
  const { data: taskRows, error: taskError } = await db
    .from('craft_tasks')
    .select(
      'id, craft_order_id, status, crafter_discord_id, crafter_username, order_quantity, box_number, craft_city, reimbursement_silver, claimed_at, delivered_at, collected_at, cancelled_at',
    )
    .eq('guild_id', guildId)
    .eq('task_kind', 'guild_order')
    .in('craft_order_id', orderIds)

  if (taskError) return { orders: [], error: taskError.message }
  const allTasks = ((taskRows ?? []) as RawTaskRow[])

  const tasksByOrder = new Map<string, RawTaskRow[]>()
  for (const t of allTasks) {
    const list = tasksByOrder.get(t.craft_order_id) ?? []
    list.push(t)
    tasksByOrder.set(t.craft_order_id, list)
  }

  const result = orders.map(o => {
    const taskList = tasksByOrder.get(o.id) ?? []
    const visibleTaskList = options.visibleTaskOwnerDiscordId
      ? taskList.filter(
          (task) =>
            task.crafter_discord_id === options.visibleTaskOwnerDiscordId &&
            (task.status === 'claimed' || task.status === 'delivered'),
        )
      : taskList
    return {
      order: mapOrder(o, taskList),
      tasks: visibleTaskList
        .sort((a, b) => (a.claimed_at ?? '').localeCompare(b.claimed_at ?? ''))
        .map(mapTask),
    }
  })
  return { orders: result }
}

export async function listCraftOrders(): Promise<{
  orders: CraftOrderWithTasks[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAnyCapability(CRAFT_ADMIN_CAPS)
    const session = await getSession()
    if (!session) return { orders: [], error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    return listCraftOrdersForGuild(db, guildId)
  } catch (e) {
    return { orders: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function listOpenCraftOrdersForMember(): Promise<{
  orders: CraftOrderWithTasks[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session?.isMember) return { orders: [], error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    return listCraftOrdersForGuild(getAdminClient(), guildId, {
      orderStatus: 'open',
      visibleTaskOwnerDiscordId: session.discordId,
    })
  } catch (e) {
    return { orders: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// ────────────────────────────────────────────────────────────
// Admin reviews — 승인 관리 페이지용
// ────────────────────────────────────────────────────────────

export interface CraftOrderTaskReviewRow {
  taskId: string
  orderId: string
  status: CraftOrderTaskStatus
  crafterDiscordId: string
  crafterUsername: string | null
  orderQuantity: number
  deliveryMemo: string | null
  reimbursementSilver: number | null
  claimedAt: string | null
  deliveredAt: string | null
  collectedAt: string | null
  cancelledAt: string | null
  itemId: string
  itemName: string | null
  unitPriceSilver: number
  notes: string | null
  postedByDiscordId: string
  postedByUsername: string | null
}

export async function listCraftOrderTasksForReview(scope: 'pending' | 'all'): Promise<{
  tasks: CraftOrderTaskReviewRow[]
  error?: string
}> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { tasks: [], error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const db = await requireAnyCapability(CRAFT_REVIEW_CAPS)

    let query = db
      .from('craft_tasks')
      .select(
        'id, craft_order_id, status, crafter_discord_id, crafter_username, order_quantity, box_number, craft_city, reimbursement_silver, claimed_at, delivered_at, collected_at, cancelled_at, craft_orders!inner(item_id, item_name, unit_price_silver, notes, posted_by_discord_id, posted_by_username)',
      )
      .eq('guild_id', guildId)
      .eq('task_kind', 'guild_order')
      .order('delivered_at', { ascending: false, nullsFirst: false })
      .order('claimed_at', { ascending: false })
      .limit(200)
    if (scope === 'pending') {
      query = query.eq('status', 'delivered')
    }

    const { data, error } = await query
    if (error) return { tasks: [], error: error.message }

    type Row = {
      id: string
      craft_order_id: string
      status: string
      crafter_discord_id: string
      crafter_username: string | null
      order_quantity: number
      box_number: number | null
      craft_city: string | null
      reimbursement_silver: number | string | null
      claimed_at: string | null
      delivered_at: string | null
      collected_at: string | null
      cancelled_at: string | null
      craft_orders:
        | {
            item_id: string
            item_name: string | null
            unit_price_silver: number | string
            notes: string | null
            posted_by_discord_id: string
            posted_by_username: string | null
          }
        | Array<{
            item_id: string
            item_name: string | null
            unit_price_silver: number | string
            notes: string | null
            posted_by_discord_id: string
            posted_by_username: string | null
          }>
    }

    const tasks: CraftOrderTaskReviewRow[] = ((data ?? []) as Row[]).map((row) => {
      const order = Array.isArray(row.craft_orders)
        ? row.craft_orders[0]
        : row.craft_orders
      return {
        taskId: row.id,
        orderId: row.craft_order_id,
        status: row.status as CraftOrderTaskStatus,
        crafterDiscordId: row.crafter_discord_id,
        crafterUsername: row.crafter_username,
        orderQuantity: row.order_quantity,
        deliveryMemo: row.craft_city,
        reimbursementSilver:
          row.reimbursement_silver !== null ? toBigintNumber(row.reimbursement_silver) : null,
        claimedAt: row.claimed_at,
        deliveredAt: row.delivered_at,
        collectedAt: row.collected_at,
        cancelledAt: row.cancelled_at,
        itemId: order?.item_id ?? '',
        itemName: order?.item_name ?? null,
        unitPriceSilver: order ? toBigintNumber(order.unit_price_silver) : 0,
        notes: order?.notes ?? null,
        postedByDiscordId: order?.posted_by_discord_id ?? '',
        postedByUsername: order?.posted_by_username ?? null,
      }
    })
    return { tasks }
  } catch (e) {
    return { tasks: [], error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function countPendingCraftOrderApprovals(guildId: string): Promise<number> {
  const db = getAdminClient()
  const { count } = await db
    .from('craft_tasks')
    .select('id', { count: 'exact', head: true })
    .eq('guild_id', guildId)
    .eq('task_kind', 'guild_order')
    .eq('status', 'delivered')
  return count ?? 0
}

// ────────────────────────────────────────────────────────────
// Admin — post / cancel / approve / reject
// ────────────────────────────────────────────────────────────

export interface PostCraftOrderInput {
  itemId: string
  itemName: string | null
  quantity: number
  unitPriceSilver: number
  notes: string | null
}

export async function postCraftOrderAdmin(
  input: PostCraftOrderInput,
): Promise<{ orderId?: string; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAnyCapability(CRAFT_CREATE_CAPS)
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const trimmedId = input.itemId?.trim() ?? ''
    if (!trimmedId) return { error: tErr('craftOrderItemRequired') }
    if (!isPositivePostgresInt(input.quantity)) {
      return { error: tErr('craftOrderQuantityInvalid') }
    }
    if (!isNonNegativePostgresInt(input.unitPriceSilver)) {
      return { error: tErr('craftOrderPriceInvalid') }
    }
    if (!isValidCraftOrderPayout(input.quantity, input.unitPriceSilver)) {
      return { error: tErr('craftOrderPriceInvalid') }
    }

    const { data, error } = await db.rpc('post_craft_order', {
      p_guild_id: guildId,
      p_actor_discord_id: session.discordId,
      p_actor_username: session.username,
      p_item_id: trimmedId,
      p_item_name: input.itemName?.trim() || null,
      p_quantity: input.quantity,
      p_unit_price_silver: input.unitPriceSilver,
      p_notes: input.notes?.trim() || null,
    })
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/craft')
    revalidatePath('/craft/orders')
    return { orderId: data as string }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function cancelCraftOrderAdmin(orderId: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const db = await requireAnyCapability(CRAFT_CREATE_CAPS)
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const { error } = await db.rpc('cancel_craft_order', {
      p_order_id: orderId,
      p_guild_id: guildId,
      p_admin_discord_id: session.discordId,
    })
    if (error) {
      if (error.message.includes('CRAFT_ORDER_NOT_FOUND')) {
        return { error: tErr('craftOrderNotFound') }
      }
      if (error.message.includes('CRAFT_ORDER_NOT_OPEN')) {
        return { error: tErr('craftOrderNotOpen') }
      }
      return { error: error.message }
    }
    revalidatePath('/admin/dashboard/craft')
    revalidatePath('/craft/orders')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function approveCraftOrderTaskAdmin(
  taskId: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const tDm = await getTranslations('discordDm')
  try {
    const db = await requireAnyCapability(CRAFT_REVIEW_CAPS)
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    // DM 위해 task 미리 조회 (수주자 + 단가 + 수량)
    const { data: task } = await db
      .from('craft_tasks')
      .select(
        'crafter_discord_id, order_quantity, craft_order_id, craft_orders!inner(item_name, item_id, unit_price_silver)',
      )
      .eq('guild_id', guildId)
      .eq('id', taskId)
      .maybeSingle()

    const { error } = await db.rpc('approve_craft_order_task', {
      p_task_id: taskId,
      p_guild_id: guildId,
      p_admin_discord_id: session.discordId,
    })
    if (error) {
      if (error.message.includes('CRAFT_TASK_NOT_FOUND')) {
        return { error: tErr('craftTaskNotFound') }
      }
      if (error.message.includes('CRAFT_TASK_NOT_DELIVERED')) {
        return { error: tErr('craftTaskNotDeliverable') }
      }
      if (error.message.includes('CRAFT_TASK_NOT_GUILD_ORDER')) {
        return { error: tErr('craftTaskKindMismatch') }
      }
      return { error: error.message }
    }

    // 신규 아이템이 처음 입고된 경우 그리드 카탈로그 (guild_tracked_inventory_items)
    // 에 자동 등록. 안 하면 RPC 가 guild_inventory_gear 에는 +n 해도 어드민
    // 재고 페이지의 trackedSuffixSet 필터에 걸려서 화면에 안 나타난다.
    const order = task?.craft_orders
      ? Array.isArray(task.craft_orders) ? task.craft_orders[0] : task.craft_orders
      : null
    const orderItemId = order?.item_id as string | undefined
    if (orderItemId) {
      void autoTrackSuffixesFromItemIds(guildId, [orderItemId])
    }

    if (task?.crafter_discord_id) {
      const payout =
        order && typeof order.unit_price_silver !== 'undefined'
          ? Number(order.unit_price_silver) * Number(task.order_quantity ?? 0)
          : 0
      const itemLabel = order?.item_name ?? order?.item_id ?? ''
      void sendDiscordDmToUser(task.crafter_discord_id as string, guildId, {
        title: tDm('craftOrderApprovedTitle'),
        body: tDm('craftOrderApprovedBody', {
          item: itemLabel,
          quantity: String(task.order_quantity ?? 0),
          silver: String(payout),
        }),
        url: '/me',
      })
    }

    revalidatePath('/admin/dashboard/craft')
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/admin/dashboard/inventory')
    revalidatePath('/craft/orders')
    revalidatePath('/me')
    revalidatePath('/', 'layout')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function rejectCraftOrderTaskAdmin(
  taskId: string,
  reason: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const tDm = await getTranslations('discordDm')
  try {
    const db = await requireAnyCapability(CRAFT_REVIEW_CAPS)
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)

    const { data: task } = await db
      .from('craft_tasks')
      .select(
        'crafter_discord_id, craft_orders!inner(item_name, item_id)',
      )
      .eq('guild_id', guildId)
      .eq('id', taskId)
      .maybeSingle()

    const { error } = await db.rpc('reject_craft_order_task', {
      p_task_id: taskId,
      p_guild_id: guildId,
      p_admin_discord_id: session.discordId,
      p_reason: reason?.trim() || null,
    })
    if (error) {
      if (error.message.includes('CRAFT_TASK_NOT_FOUND')) {
        return { error: tErr('craftTaskNotFound') }
      }
      if (error.message.includes('CRAFT_TASK_NOT_DELIVERED')) {
        return { error: tErr('craftTaskNotDeliverable') }
      }
      if (error.message.includes('CRAFT_TASK_NOT_GUILD_ORDER')) {
        return { error: tErr('craftTaskKindMismatch') }
      }
      return { error: error.message }
    }

    if (task?.crafter_discord_id) {
      const order = Array.isArray(task.craft_orders)
        ? task.craft_orders[0]
        : task.craft_orders
      const itemLabel = order?.item_name ?? order?.item_id ?? ''
      void sendDiscordDmToUser(task.crafter_discord_id as string, guildId, {
        title: tDm('craftOrderRejectedTitle'),
        body: tDm('craftOrderRejectedBody', {
          item: itemLabel,
          reason: reason?.trim() || '-',
        }),
        url: '/craft/orders',
      })
    }

    revalidatePath('/admin/dashboard/craft')
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/craft/orders')
    revalidatePath('/', 'layout')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

// ────────────────────────────────────────────────────────────
// Member — claim / release / deliver
// ────────────────────────────────────────────────────────────

export interface ClaimCraftOrderInput {
  orderId: string
  quantity: number
}

export async function claimCraftOrder(
  input: ClaimCraftOrderInput,
): Promise<{ taskId?: string; error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()

    if (!isPositivePostgresInt(input.quantity)) {
      return { error: tErr('craftOrderQuantityInvalid') }
    }

    const { data, error } = await db.rpc('claim_craft_order', {
      p_order_id: input.orderId,
      p_guild_id: guildId,
      p_crafter_discord_id: session.discordId,
      p_crafter_username: session.username,
      p_quantity: input.quantity,
    })
    if (error) {
      if (error.message.includes('CRAFT_ORDER_NOT_FOUND')) {
        return { error: tErr('craftOrderNotFound') }
      }
      if (error.message.includes('CRAFT_ORDER_NOT_OPEN')) {
        return { error: tErr('craftOrderNotOpen') }
      }
      if (error.message.includes('CRAFT_ORDER_OVERSUBSCRIBED')) {
        return { error: tErr('craftOrderOversubscribed') }
      }
      return { error: error.message }
    }
    revalidatePath('/craft/orders')
    revalidatePath('/admin/dashboard/craft')
    return { taskId: data as string }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function releaseCraftOrderTask(
  taskId: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()

    const { error } = await db.rpc('release_craft_order_task', {
      p_task_id: taskId,
      p_guild_id: guildId,
      p_crafter_discord_id: session.discordId,
    })
    if (error) {
      if (error.message.includes('CRAFT_TASK_RELEASE_FAILED')) {
        return { error: tErr('craftTaskReleaseFailed') }
      }
      return { error: error.message }
    }
    revalidatePath('/craft/orders')
    revalidatePath('/admin/dashboard/craft')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export interface DeliverCraftOrderInput {
  taskId: string
  // 자유 메모 — "Lymhurst, 9번 보관함" 같이 도시 + 위치를 한 줄에 쓴다.
  // craft_city 컬럼을 그대로 재사용 (박스/도시 구조 입력은 폐기).
  memo: string
}

export async function deliverCraftOrderTask(
  input: DeliverCraftOrderInput,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  const tAdminNotify = await getTranslations('adminNotificationMessages')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('unauthorized') }
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()

    const expirySetting = await db
      .from('app_settings')
      .select('value')
      .eq('guild_id', guildId)
      .eq('key', 'craft_box_expiry_days')
      .maybeSingle()
    const expiryDays = (() => {
      const raw = expirySetting.data?.value
      const parsed = typeof raw === 'string' ? Number.parseInt(raw, 10) : NaN
      return Number.isInteger(parsed) && parsed >= 1 && parsed <= 30 ? parsed : 7
    })()

    const { error } = await db.rpc('deliver_craft_order_task', {
      p_task_id: input.taskId,
      p_guild_id: guildId,
      p_crafter_discord_id: session.discordId,
      p_box_number: null,
      p_craft_city: input.memo?.trim() || null,
      p_craft_focus_used: false,
      p_expiry_days: expiryDays,
    })
    if (error) {
      if (error.message.includes('CRAFT_TASK_DELIVER_FAILED')) {
        return { error: tErr('craftTaskDeliverFailed') }
      }
      return { error: error.message }
    }
    const { data: task } = await db
      .from('craft_tasks')
      .select(
        'id, order_quantity, craft_orders!inner(item_name, item_id)',
      )
      .eq('guild_id', guildId)
      .eq('id', input.taskId)
      .maybeSingle()
    revalidatePath('/craft/orders')
    revalidatePath('/admin/dashboard/craft')
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/', 'layout')
    const order = task?.craft_orders
      ? Array.isArray(task.craft_orders) ? task.craft_orders[0] : task.craft_orders
      : null
    void sendAdminNotification({
      guildId,
      topic: 'craft',
      sourceTable: 'craft_tasks',
      sourceId: input.taskId,
      title: tAdminNotify('craftTitle'),
      body: tAdminNotify('craftBody', {
        user: session.username,
        item: (order?.item_name as string | null) ?? (order?.item_id as string | undefined) ?? input.taskId,
        quantity: String(task?.order_quantity ?? 0),
      }),
      url: '/admin/dashboard/approvals?tab=craft',
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
