'use server'

// 길드원 상점 액션 — 잔액 조회, 주문 제출, 본인 주문 조회.

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { computePointPrice, parseShopDiscountRate } from '@/lib/shop/price'
import { getAppSetting } from '@/lib/app-settings'
import { getMemberPointBalance } from '@/lib/point-ledger'
import { isLocalGuildAccountRestrictedFromResources } from '@/lib/local-guild-account'

export interface OrderLineInput {
  inventoryId: string
  quantity: number
}

export interface SubmitOrderResult {
  ok: boolean
  orderId?: string
  error?: string
}

const MEMO_MAX = 500
const MAX_LINES = 50

export async function getMyPointBalance(): Promise<number> {
  const session = await getSession()
  if (!session?.isMember) return 0
  if (isLocalGuildAccountRestrictedFromResources(session)) return 0
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const { balance, error } = await getMemberPointBalance(db, guildId, session.discordId)
  if (error) return 0
  return balance
}

export async function submitShopOrder(
  lines: OrderLineInput[],
  memberNote: string,
): Promise<SubmitOrderResult> {
  const tErr = await getTranslations('memberActionError')
  try {
    const session = await getSession()
    if (!session) return { ok: false, error: tErr('loginRequired') }
    if (!session.isMember) return { ok: false, error: tErr('memberOnlyOrder') }
    if (isLocalGuildAccountRestrictedFromResources(session)) {
      return { ok: false, error: tErr('localAccountResourceBlocked') }
    }
    if (!Array.isArray(lines) || lines.length === 0) {
      return { ok: false, error: tErr('cartEmpty') }
    }
    if (lines.length > MAX_LINES) {
      return { ok: false, error: tErr('orderLineLimit', { max: MAX_LINES }) }
    }
    const trimmedNote = memberNote.trim()
    if (trimmedNote.length > MEMO_MAX) {
      return { ok: false, error: tErr('shopMemoTooLong', { max: MEMO_MAX }) }
    }

    const db = getAdminClient()
    const guildId = await getSessionGuildId(session)

    // 할인율 + 재고 + 가격 조회.
    const rateSetting = await getAppSetting('shop_discount_rate', '1', guildId)
    const discountRate = parseShopDiscountRate(rateSetting)

    const ids = Array.from(new Set(lines.map((l) => l.inventoryId)))
    const { data: inventoryRows, error: invErr } = await db
      .from('shop_inventory')
      .select(
        'id, unique_name, enchant, quality, stock, name_ko, manual_price, auto_price_silver',
      )
      .eq('guild_id', guildId)
      .in('id', ids)
    if (invErr) return { ok: false, error: invErr.message }
    const invMap = new Map(
      (inventoryRows ?? []).map((r) => [r.id as string, r]),
    )

    // 라인 검증 + 총액 계산.
    const orderLines: Array<{
      uniqueName: string
      enchant: number
      quality: number
      nameKo: string
      quantity: number
      unitPoints: number
      subtotalPoints: number
    }> = []
    let total = 0
    for (const l of lines) {
      if (!Number.isInteger(l.quantity) || l.quantity <= 0) {
        return { ok: false, error: tErr('quantityMustBePositiveInt') }
      }
      const inv = invMap.get(l.inventoryId)
      if (!inv) return { ok: false, error: tErr('unknownItem') }
      if ((inv.stock as number) < l.quantity) {
        return {
          ok: false,
          error: tErr('itemStockShort', { name: inv.name_ko as string, stock: inv.stock as number }),
        }
      }
      const unit = computePointPrice({
        manualPrice: inv.manual_price as number | null,
        autoPriceSilver: inv.auto_price_silver as number | null,
        discountRate,
      })
      if (unit === null) {
        return { ok: false, error: tErr('itemPriceNotSet', { name: inv.name_ko as string }) }
      }
      const sub = unit * l.quantity
      total += sub
      orderLines.push({
        uniqueName: inv.unique_name as string,
        enchant: inv.enchant as number,
        quality: inv.quality as number,
        nameKo: inv.name_ko as string,
        quantity: l.quantity,
        unitPoints: unit,
        subtotalPoints: sub,
      })
    }

    if (total <= 0) return { ok: false, error: tErr('orderTotalNotPositive') }

    // 잔액 체크 (UX 용 사전 검증; approve RPC 에서 재확인함).
    const { balance, error: balanceError } = await getMemberPointBalance(db, guildId, session.discordId)
    if (balanceError) return { ok: false, error: balanceError }
    if (balance < total) {
      return { ok: false, error: tErr('insufficientPointsWithDetail', { balance, total }) }
    }

    // 주문 + 라인 원자적 삽입 (마이그 119). 두 단계가 한 트랜잭션이라 부분 성공
    // 으로 인한 좀비 주문 위험 없음.
    const linesPayload = orderLines.map((l) => ({
      unique_name: l.uniqueName,
      enchant: l.enchant,
      quality: l.quality,
      name_ko: l.nameKo,
      quantity: l.quantity,
      unit_points: l.unitPoints,
      subtotal_points: l.subtotalPoints,
    }))
    const { data: orderId, error: rpcErr } = await db.rpc('submit_shop_order', {
      p_guild_id: guildId,
      p_discord_id: session.discordId,
      p_username: session.username,
      p_total_points: total,
      p_member_note: trimmedNote || null,
      p_lines: linesPayload,
    })
    if (rpcErr) return { ok: false, error: rpcErr.message }
    if (!orderId) return { ok: false, error: 'Server error' }

    revalidatePath('/shop')
    revalidatePath('/me')
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/', 'layout')
    return { ok: true, orderId: orderId as string }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Server error' }
  }
}

export interface MyOrderRow {
  id: string
  totalPoints: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  memberNote: string | null
  adminNote: string | null
  createdAt: string
  resolvedAt: string | null
  items: Array<{
    nameKo: string
    uniqueName: string
    enchant: number
    quality: number
    quantity: number
    unitPoints: number
  }>
}

export async function listMyShopOrders(limit = 20): Promise<MyOrderRow[]> {
  const session = await getSession()
  if (!session) return []
  if (isLocalGuildAccountRestrictedFromResources(session)) return []
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const { data: orders } = await db
    .from('shop_orders')
    .select('id, total_points, status, member_note, admin_note, created_at, resolved_at')
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (!orders || orders.length === 0) return []
  const ids = orders.map((o) => o.id as string)
  const { data: items } = await db
    .from('shop_order_items')
    .select('order_id, name_ko, unique_name, enchant, quality, quantity, unit_points')
    .eq('guild_id', guildId)
    .in('order_id', ids)
  const itemsByOrder = new Map<string, MyOrderRow['items']>()
  for (const it of items ?? []) {
    const key = it.order_id as string
    const arr = itemsByOrder.get(key) ?? []
    arr.push({
      nameKo: it.name_ko as string,
      uniqueName: it.unique_name as string,
      enchant: it.enchant as number,
      quality: it.quality as number,
      quantity: it.quantity as number,
      unitPoints: it.unit_points as number,
    })
    itemsByOrder.set(key, arr)
  }
  return orders.map((o) => ({
    id: o.id as string,
    totalPoints: o.total_points as number,
    status: o.status as MyOrderRow['status'],
    memberNote: (o.member_note as string | null) ?? null,
    adminNote: (o.admin_note as string | null) ?? null,
    createdAt: o.created_at as string,
    resolvedAt: (o.resolved_at as string | null) ?? null,
    items: itemsByOrder.get(o.id as string) ?? [],
  }))
}

export async function cancelMyOrder(orderId: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  try {
    const session = await getSession()
    if (!session) return { error: tErr('loginRequired') }
    if (isLocalGuildAccountRestrictedFromResources(session)) {
      return { error: tErr('localAccountResourceBlocked') }
    }
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()
    const { error } = await db
      .from('shop_orders')
      .update({ status: 'cancelled', resolved_at: new Date().toISOString(), resolved_by: session.discordId })
      .eq('guild_id', guildId)
      .eq('id', orderId)
      .eq('discord_id', session.discordId)
      .eq('status', 'pending')
    if (error) return { error: error.message }
    revalidatePath('/shop')
    revalidatePath('/me')
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/', 'layout')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}
