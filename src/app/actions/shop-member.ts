'use server'

// 길드원 상점 액션 — 잔액 조회, 주문 제출, 본인 주문 조회.

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { computePointPrice, parseShopDiscountRate } from '@/lib/shop/price'
import { getAppSetting } from '@/lib/app-settings'

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
  const db = getAdminClient()
  const { data, error } = await db
    .from('point_ledger')
    .select('delta')
    .eq('discord_id', session.discordId)
  if (error) return 0
  return (data ?? []).reduce((sum, r) => sum + (r.delta as number), 0)
}

export async function submitShopOrder(
  lines: OrderLineInput[],
  memberNote: string,
): Promise<SubmitOrderResult> {
  try {
    const session = await getSession()
    if (!session) return { ok: false, error: '로그인이 필요합니다.' }
    if (!session.isMember) return { ok: false, error: '길드원만 주문할 수 있습니다.' }
    if (!Array.isArray(lines) || lines.length === 0) {
      return { ok: false, error: '장바구니가 비어있습니다.' }
    }
    if (lines.length > MAX_LINES) {
      return { ok: false, error: `한 번에 ${MAX_LINES}개 항목까지만 주문 가능합니다.` }
    }
    const trimmedNote = memberNote.trim()
    if (trimmedNote.length > MEMO_MAX) {
      return { ok: false, error: `메모는 ${MEMO_MAX}자까지 입력 가능합니다.` }
    }

    const db = getAdminClient()

    // 할인율 + 재고 + 가격 조회.
    const rateSetting = await getAppSetting('shop_discount_rate', '1')
    const discountRate = parseShopDiscountRate(rateSetting)

    const ids = Array.from(new Set(lines.map((l) => l.inventoryId)))
    const { data: inventoryRows, error: invErr } = await db
      .from('shop_inventory')
      .select(
        'id, unique_name, enchant, quality, stock, name_ko, manual_price, auto_price_silver',
      )
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
        return { ok: false, error: '수량은 1 이상 정수.' }
      }
      const inv = invMap.get(l.inventoryId)
      if (!inv) return { ok: false, error: '존재하지 않는 아이템이 포함되어 있습니다.' }
      if ((inv.stock as number) < l.quantity) {
        return {
          ok: false,
          error: `재고 부족: ${inv.name_ko} (${inv.stock}개 남음)`,
        }
      }
      const unit = computePointPrice({
        manualPrice: inv.manual_price as number | null,
        autoPriceSilver: inv.auto_price_silver as number | null,
        discountRate,
      })
      if (unit === null) {
        return { ok: false, error: `가격 미정 아이템: ${inv.name_ko}` }
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

    if (total <= 0) return { ok: false, error: '총 금액이 0 이하입니다.' }

    // 잔액 체크 (UX 용 사전 검증; approve RPC 에서 재확인함).
    const { data: ledger, error: ledgerErr } = await db
      .from('point_ledger')
      .select('delta')
      .eq('discord_id', session.discordId)
    if (ledgerErr) return { ok: false, error: ledgerErr.message }
    const balance = (ledger ?? []).reduce((sum, r) => sum + (r.delta as number), 0)
    if (balance < total) {
      return { ok: false, error: `포인트 부족 (보유 ${balance}p, 필요 ${total}p)` }
    }

    // 주문 + 라인 삽입.
    const { data: orderRow, error: insertErr } = await db
      .from('shop_orders')
      .insert({
        discord_id: session.discordId,
        username: session.username,
        total_points: total,
        status: 'pending',
        member_note: trimmedNote || null,
      })
      .select('id')
      .single()
    if (insertErr) return { ok: false, error: insertErr.message }
    const orderId = orderRow.id as string

    const lineRows = orderLines.map((l) => ({
      order_id: orderId,
      unique_name: l.uniqueName,
      enchant: l.enchant,
      quality: l.quality,
      name_ko: l.nameKo,
      quantity: l.quantity,
      unit_points: l.unitPoints,
      subtotal_points: l.subtotalPoints,
    }))
    const { error: lineErr } = await db.from('shop_order_items').insert(lineRows)
    if (lineErr) {
      // 라인 삽입 실패 시 주문 롤백.
      await db.from('shop_orders').delete().eq('id', orderId)
      return { ok: false, error: lineErr.message }
    }

    revalidatePath('/shop')
    revalidatePath('/me')
    revalidatePath('/admin/dashboard/approvals')
    return { ok: true, orderId }
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
  const db = getAdminClient()
  const { data: orders } = await db
    .from('shop_orders')
    .select('id, total_points, status, member_note, admin_note, created_at, resolved_at')
    .eq('discord_id', session.discordId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (!orders || orders.length === 0) return []
  const ids = orders.map((o) => o.id as string)
  const { data: items } = await db
    .from('shop_order_items')
    .select('order_id, name_ko, unique_name, enchant, quality, quantity, unit_points')
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
  try {
    const session = await getSession()
    if (!session) return { error: '로그인이 필요합니다.' }
    const db = getAdminClient()
    const { error } = await db
      .from('shop_orders')
      .update({ status: 'cancelled', resolved_at: new Date().toISOString(), resolved_by: session.discordId })
      .eq('id', orderId)
      .eq('discord_id', session.discordId)
      .eq('status', 'pending')
    if (error) return { error: error.message }
    revalidatePath('/shop')
    revalidatePath('/me')
    revalidatePath('/admin/dashboard/approvals')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}
