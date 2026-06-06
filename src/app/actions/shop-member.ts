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
import { sendAdminNotification } from '@/lib/admin-notifications'
import { canonicalShopQuality } from '@/lib/shop/quality'

export interface OrderLineInput {
  inventoryId: string
  quantity: number
  memberQuoteUnitSilver?: number | null
  memberQuoteCity?: string | null
  memberQuoteNote?: string | null
  memberQuoteEvidenceUrl?: string | null
}

export interface SubmitOrderResult {
  ok: boolean
  orderId?: string
  error?: string
}

const MEMO_MAX = 500
const MAX_LINES = 50
const QUOTE_CITY_MAX = 40
const QUOTE_NOTE_MAX = 200
const QUOTE_EVIDENCE_URL_MAX = 300
const POSTGRES_INT_MAX = 2147483647
const SHOP_ADMIN_NOTIFICATION_ITEM_LIMIT = 8
const SHOP_ADMIN_NOTIFICATION_ITEM_NAME_MAX = 80

interface NormalizedQuote {
  unitSilver: number
  city: string | null
  note: string | null
  evidenceUrl: string | null
}

interface NormalizedOrderInputLine {
  inventoryId: string
  quantity: number
  quote: NormalizedQuote | null
}

interface ShopOrderLine {
  uniqueName: string
  enchant: number
  quality: number
  nameKo: string
  quantity: number
  unitPoints: number
  subtotalPoints: number
  pricingSource: 'catalog' | 'member_quote'
  catalogUnitSilverSnapshot: number | null
  memberQuoteUnitSilver: number | null
  memberQuoteUnitPoints: number | null
  memberQuoteCity: string | null
  memberQuoteNote: string | null
  memberQuoteEvidenceUrl: string | null
}

function trimOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function compactText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1))}…`
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function sameQuote(a: NormalizedQuote | null, b: NormalizedQuote | null): boolean {
  if (a === null || b === null) return a === b
  return (
    a.unitSilver === b.unitSilver &&
    a.city === b.city &&
    a.note === b.note &&
    a.evidenceUrl === b.evidenceUrl
  )
}

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
  const tAdminNotify = await getTranslations('adminNotificationMessages')
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

    const lineByInventoryId = new Map<string, NormalizedOrderInputLine>()
    for (const line of lines) {
      if (typeof line.inventoryId !== 'string' || !line.inventoryId.trim()) {
        return { ok: false, error: tErr('unknownItem') }
      }
      if (
        !Number.isInteger(line.quantity) ||
        line.quantity <= 0 ||
        line.quantity > POSTGRES_INT_MAX
      ) {
        return { ok: false, error: tErr('quantityMustBePositiveInt') }
      }
      const city = trimOptionalString(line.memberQuoteCity)
      const note = trimOptionalString(line.memberQuoteNote)
      const evidenceUrl = trimOptionalString(line.memberQuoteEvidenceUrl)
      if (city && city.length > QUOTE_CITY_MAX) {
        return { ok: false, error: tErr('shopQuoteCityTooLong', { max: QUOTE_CITY_MAX }) }
      }
      if (note && note.length > QUOTE_NOTE_MAX) {
        return { ok: false, error: tErr('shopQuoteNoteTooLong', { max: QUOTE_NOTE_MAX }) }
      }
      if (evidenceUrl && evidenceUrl.length > QUOTE_EVIDENCE_URL_MAX) {
        return { ok: false, error: tErr('shopQuoteEvidenceUrlTooLong', { max: QUOTE_EVIDENCE_URL_MAX }) }
      }
      if (evidenceUrl && !isHttpUrl(evidenceUrl)) {
        return { ok: false, error: tErr('shopQuoteEvidenceUrlInvalid') }
      }

      const rawQuote = line.memberQuoteUnitSilver
      const hasQuoteMeta = city !== null || note !== null || evidenceUrl !== null
      let quote: NormalizedQuote | null = null
      if (rawQuote !== null && rawQuote !== undefined) {
        const unitSilver = Number(rawQuote)
        if (
          !Number.isInteger(unitSilver) ||
          unitSilver <= 0 ||
          unitSilver > POSTGRES_INT_MAX
        ) {
          return { ok: false, error: tErr('shopQuotePriceInvalid') }
        }
        quote = { unitSilver, city, note, evidenceUrl }
      } else if (hasQuoteMeta) {
        return { ok: false, error: tErr('shopQuotePriceRequired') }
      }

      const current = lineByInventoryId.get(line.inventoryId)
      const currentQuantity = current?.quantity ?? 0
      if (current && !sameQuote(current.quote, quote)) {
        return { ok: false, error: tErr('shopQuoteDuplicateConflict') }
      }
      const nextQuantity = currentQuantity + line.quantity
      if (nextQuantity > POSTGRES_INT_MAX) {
        return { ok: false, error: tErr('quantityMustBePositiveInt') }
      }
      lineByInventoryId.set(line.inventoryId, {
        inventoryId: line.inventoryId,
        quantity: nextQuantity,
        quote,
      })
    }

    const db = getAdminClient()
    const guildId = await getSessionGuildId(session)

    // 할인율 + 재고 + 가격 조회.
    const rateSetting = await getAppSetting('shop_discount_rate', '1', guildId)
    const discountRate = parseShopDiscountRate(rateSetting)

    const ids = Array.from(lineByInventoryId.keys())
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
    const orderLines: ShopOrderLine[] = []
    let total = 0
    let priceReviewRequired = false
    for (const line of lineByInventoryId.values()) {
      const inv = invMap.get(line.inventoryId)
      if (!inv) return { ok: false, error: tErr('unknownItem') }
      if ((inv.stock as number) < line.quantity) {
        return {
          ok: false,
          error: tErr('itemStockShort', { name: inv.name_ko as string, stock: inv.stock as number }),
        }
      }
      const catalogUnitSilver =
        typeof inv.manual_price === 'number' && inv.manual_price >= 0
          ? inv.manual_price
          : typeof inv.auto_price_silver === 'number' && inv.auto_price_silver > 0
            ? inv.auto_price_silver
            : null
      const catalogUnitPoints = computePointPrice({
        manualPrice: inv.manual_price as number | null,
        autoPriceSilver: inv.auto_price_silver as number | null,
        discountRate,
      })
      const quoteUnitPoints = line.quote
        ? computePointPrice({
            manualPrice: line.quote.unitSilver,
            autoPriceSilver: null,
            discountRate,
          })
        : null
      const unit = quoteUnitPoints ?? catalogUnitPoints
      if (unit === null) {
        return { ok: false, error: tErr('itemPriceQuoteRequired', { name: inv.name_ko as string }) }
      }
      if (line.quote) priceReviewRequired = true
      const sub = unit * line.quantity
      if (sub > POSTGRES_INT_MAX || total + sub > POSTGRES_INT_MAX) {
        return { ok: false, error: tErr('invalidAmount') }
      }
      total += sub
      orderLines.push({
        uniqueName: inv.unique_name as string,
        enchant: inv.enchant as number,
        quality: canonicalShopQuality(),
        nameKo: inv.name_ko as string,
        quantity: line.quantity,
        unitPoints: unit,
        subtotalPoints: sub,
        pricingSource: quoteUnitPoints !== null ? 'member_quote' : 'catalog',
        catalogUnitSilverSnapshot: catalogUnitSilver,
        memberQuoteUnitSilver: line.quote?.unitSilver ?? null,
        memberQuoteUnitPoints: quoteUnitPoints,
        memberQuoteCity: line.quote?.city ?? null,
        memberQuoteNote: line.quote?.note ?? null,
        memberQuoteEvidenceUrl: line.quote?.evidenceUrl ?? null,
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
      pricing_source: l.pricingSource,
      catalog_unit_silver_snapshot: l.catalogUnitSilverSnapshot,
      member_quote_unit_silver: l.memberQuoteUnitSilver,
      member_quote_unit_points: l.memberQuoteUnitPoints,
      member_quote_city: l.memberQuoteCity,
      member_quote_note: l.memberQuoteNote,
      member_quote_evidence_url: l.memberQuoteEvidenceUrl,
    }))
    const { data: orderId, error: rpcErr } = await db.rpc('submit_shop_order', {
      p_guild_id: guildId,
      p_discord_id: session.discordId,
      p_username: session.username,
      p_total_points: total,
      p_member_note: trimmedNote || null,
      p_price_review_required: priceReviewRequired,
      p_lines: linesPayload,
    })
    if (rpcErr) return { ok: false, error: rpcErr.message }
    if (!orderId) return { ok: false, error: 'Server error' }
    const orderIdString = orderId as string

    revalidatePath('/shop')
    revalidatePath('/me')
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/', 'layout')
    const visibleOrderLines = orderLines.slice(0, SHOP_ADMIN_NOTIFICATION_ITEM_LIMIT)
    const itemSummaryLines = visibleOrderLines.map((line) => {
      const item = compactText(
        line.enchant > 0 ? `${line.nameKo} .${line.enchant}` : line.nameKo,
        SHOP_ADMIN_NOTIFICATION_ITEM_NAME_MAX,
      )
      return tAdminNotify('shopItemLine', {
        item,
        quantity: line.quantity.toLocaleString('en-US'),
        points: line.subtotalPoints.toLocaleString('en-US'),
      })
    })
    const hiddenItemCount = orderLines.length - visibleOrderLines.length
    if (hiddenItemCount > 0) {
      itemSummaryLines.push(tAdminNotify('shopItemsMore', { count: hiddenItemCount }))
    }
    const totalQuantity = orderLines.reduce((sum, line) => sum + line.quantity, 0)
    const notificationFields = [
      {
        name: tAdminNotify('shopItemsField'),
        value: itemSummaryLines.join('\n'),
      },
      {
        name: tAdminNotify('shopSummaryField'),
        value: tAdminNotify('shopSummaryValue', {
          points: total.toLocaleString('en-US'),
          types: orderLines.length,
          quantity: totalQuantity.toLocaleString('en-US'),
        }),
        inline: true,
      },
      ...(priceReviewRequired
        ? [
            {
              name: tAdminNotify('shopPriceReviewField'),
              value: tAdminNotify('shopPriceReviewValue'),
              inline: true,
            },
          ]
        : []),
    ]
    void sendAdminNotification({
      guildId,
      topic: 'shop',
      sourceTable: 'shop_orders',
      sourceId: orderIdString,
      title: tAdminNotify('shopTitle'),
      body: tAdminNotify('shopBody', {
        user: session.username,
        points: total.toLocaleString('en-US'),
      }),
      url: `/admin/dashboard/approvals?tab=shop&order=${encodeURIComponent(orderIdString)}#shop-order-${encodeURIComponent(orderIdString)}`,
      fields: notificationFields,
    })
    return { ok: true, orderId: orderIdString }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Server error' }
  }
}

export interface MyOrderRow {
  id: string
  totalPoints: number
  priceReviewRequired: boolean
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  memberNote: string | null
  adminNote: string | null
  pickupNote: string | null
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
    .select('id, total_points, price_review_required, status, member_note, admin_note, pickup_note, created_at, resolved_at')
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
    priceReviewRequired: Boolean(o.price_review_required),
    status: o.status as MyOrderRow['status'],
    memberNote: (o.member_note as string | null) ?? null,
    adminNote: (o.admin_note as string | null) ?? null,
    pickupNote: (o.pickup_note as string | null) ?? null,
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
    const { error } = await db.rpc('cancel_shop_order', {
      p_id: orderId,
      p_guild_id: guildId,
      p_discord_id: session.discordId,
    })
    if (error) {
      if (error.message.includes('ORDER_NOT_PENDING')) {
        return { error: tErr('alreadyProcessedCannotCancel') }
      }
      return { error: error.message }
    }
    revalidatePath('/shop')
    revalidatePath('/me')
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/', 'layout')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Server error' }
  }
}
