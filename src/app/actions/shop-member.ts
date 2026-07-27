'use server'


import { publicActionError, publicActionMessage } from '@/lib/public-action-error'
// 길드원 상점 액션 — 잔액 조회, 주문 제출, 본인 주문 조회.

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { computePointPrice, parseShopDiscountRate } from '@/lib/shop/price'
import { getAppSetting } from '@/lib/app-settings'
import { getMemberSpendablePointBalance } from '@/lib/point-ledger'
import { isLocalGuildAccountRestrictedFromResources } from '@/lib/local-guild-account'
import { sendAdminNotification } from '@/lib/admin-notifications'
import { canonicalShopQuality } from '@/lib/shop/quality'
import { revalidatePublicShopCache } from '@/lib/shop/cache'
import {
  getShopPointBalanceForMember,
  listShopOrdersForMember,
  type MyOrderRow,
} from '@/lib/shop/member-queries'
import {
  countShopOrdersForMember,
  type MemberRequestCounts,
} from '@/lib/member-request-counts'

export type { MyOrderRow } from '@/lib/shop/member-queries'

export interface OrderLineInput {
  inventoryId: string
  quantity: number
  expectedUnitPoints?: number
  memberQuoteUnitSilver?: number | null
  memberQuoteCity?: string | null
  memberQuoteNote?: string | null
}

export interface SubmitOrderResult {
  ok: boolean
  orderId?: string
  error?: string
}

export interface ShopOrderReviewLine {
  inventoryId: string
  quantity: number
  unitPoints: number
  subtotalPoints: number
  pricingSource: 'catalog' | 'member_quote'
}

export type ReviewShopOrderResult =
  | { ok: true; lines: ShopOrderReviewLine[]; balance: number }
  | { ok: false; error: string }

const MEMO_MAX = 500
const MAX_LINES = 50
const QUOTE_CITY_MAX = 40
const QUOTE_NOTE_MAX = 200
const POSTGRES_INT_MAX = 2147483647
const SHOP_ADMIN_NOTIFICATION_ITEM_LIMIT = 8
const SHOP_ADMIN_NOTIFICATION_ITEM_NAME_MAX = 80

function revalidateShopSurfaces(guildId: string): void {
  revalidatePublicShopCache(guildId)
  revalidatePath('/shop')
}

interface NormalizedQuote {
  unitSilver: number
  city: string | null
  note: string | null
}

interface NormalizedOrderInputLine {
  inventoryId: string
  quantity: number
  quote: NormalizedQuote | null
  expectedUnitPoints: number | null
}

interface ShopOrderLine {
  inventoryId: string
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
}

type MemberActionTranslator = Awaited<ReturnType<typeof getTranslations<'memberActionError'>>>
type ShopMemberDb = ReturnType<typeof getAdminClient>

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

function sameQuote(a: NormalizedQuote | null, b: NormalizedQuote | null): boolean {
  if (a === null || b === null) return a === b
  return (
    a.unitSilver === b.unitSilver &&
    a.city === b.city &&
    a.note === b.note
  )
}

function normalizeShopOrderInputs(
  lines: OrderLineInput[],
  tErr: MemberActionTranslator,
): { lines: Map<string, NormalizedOrderInputLine> } | { error: string } {
  if (!Array.isArray(lines) || lines.length === 0) return { error: tErr('cartEmpty') }
  if (lines.length > MAX_LINES) return { error: tErr('orderLineLimit', { max: MAX_LINES }) }

  const lineByInventoryId = new Map<string, NormalizedOrderInputLine>()
  for (const line of lines) {
    if (typeof line.inventoryId !== 'string' || !line.inventoryId.trim()) {
      return { error: tErr('unknownItem') }
    }
    if (
      !Number.isInteger(line.quantity) ||
      line.quantity <= 0 ||
      line.quantity > POSTGRES_INT_MAX
    ) {
      return { error: tErr('quantityMustBePositiveInt') }
    }
    const city = trimOptionalString(line.memberQuoteCity)
    const note = trimOptionalString(line.memberQuoteNote)
    if (city && city.length > QUOTE_CITY_MAX) {
      return { error: tErr('shopQuoteCityTooLong', { max: QUOTE_CITY_MAX }) }
    }
    if (note && note.length > QUOTE_NOTE_MAX) {
      return { error: tErr('shopQuoteNoteTooLong', { max: QUOTE_NOTE_MAX }) }
    }

    const rawQuote = line.memberQuoteUnitSilver
    const hasQuoteMeta = city !== null || note !== null
    let quote: NormalizedQuote | null = null
    if (rawQuote !== null && rawQuote !== undefined) {
      const unitSilver = Number(rawQuote)
      if (
        !Number.isInteger(unitSilver) ||
        unitSilver <= 0 ||
        unitSilver > POSTGRES_INT_MAX
      ) {
        return { error: tErr('shopQuotePriceInvalid') }
      }
      quote = { unitSilver, city, note }
    } else if (hasQuoteMeta) {
      return { error: tErr('shopQuotePriceRequired') }
    }

    let expectedUnitPoints: number | null = null
    if (line.expectedUnitPoints !== undefined) {
      if (
        !Number.isInteger(line.expectedUnitPoints) ||
        line.expectedUnitPoints < 0 ||
        line.expectedUnitPoints > POSTGRES_INT_MAX
      ) {
        return { error: tErr('shopPriceChanged') }
      }
      expectedUnitPoints = line.expectedUnitPoints
    }

    const current = lineByInventoryId.get(line.inventoryId)
    if (current && !sameQuote(current.quote, quote)) {
      return { error: tErr('shopQuoteDuplicateConflict') }
    }
    if (current && current.expectedUnitPoints !== expectedUnitPoints) {
      return { error: tErr('shopPriceChanged') }
    }
    const nextQuantity = (current?.quantity ?? 0) + line.quantity
    if (nextQuantity > POSTGRES_INT_MAX) {
      return { error: tErr('quantityMustBePositiveInt') }
    }
    lineByInventoryId.set(line.inventoryId, {
      inventoryId: line.inventoryId,
      quantity: nextQuantity,
      quote,
      expectedUnitPoints,
    })
  }
  return { lines: lineByInventoryId }
}

async function resolveShopOrderPricing(
  db: ShopMemberDb,
  guildId: string,
  lineByInventoryId: Map<string, NormalizedOrderInputLine>,
  tErr: MemberActionTranslator,
): Promise<
  | { orderLines: ShopOrderLine[]; total: number; priceReviewRequired: boolean }
  | { error: string }
> {
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
  if (invErr) return { error: await publicActionError(invErr, 'actions/shop-member') }
  const invMap = new Map((inventoryRows ?? []).map((row) => [row.id as string, row]))

  const orderLines: ShopOrderLine[] = []
  let total = 0
  let priceReviewRequired = false
  for (const line of lineByInventoryId.values()) {
    const inv = invMap.get(line.inventoryId)
    if (!inv) return { error: tErr('unknownItem') }
    if ((inv.stock as number) < line.quantity) {
      return {
        error: tErr('itemStockShort', {
          name: inv.name_ko as string,
          stock: inv.stock as number,
        }),
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
      return { error: tErr('itemPriceQuoteRequired', { name: inv.name_ko as string }) }
    }
    if (line.expectedUnitPoints !== null && line.expectedUnitPoints !== unit) {
      return { error: tErr('shopPriceChanged') }
    }
    if (line.quote) priceReviewRequired = true
    const subtotalPoints = unit * line.quantity
    if (subtotalPoints > POSTGRES_INT_MAX || total + subtotalPoints > POSTGRES_INT_MAX) {
      return { error: tErr('invalidAmount') }
    }
    total += subtotalPoints
    orderLines.push({
      inventoryId: line.inventoryId,
      uniqueName: inv.unique_name as string,
      enchant: inv.enchant as number,
      quality: canonicalShopQuality(),
      nameKo: inv.name_ko as string,
      quantity: line.quantity,
      unitPoints: unit,
      subtotalPoints,
      pricingSource: quoteUnitPoints !== null ? 'member_quote' : 'catalog',
      catalogUnitSilverSnapshot: catalogUnitSilver,
      memberQuoteUnitSilver: line.quote?.unitSilver ?? null,
      memberQuoteUnitPoints: quoteUnitPoints,
      memberQuoteCity: line.quote?.city ?? null,
      memberQuoteNote: line.quote?.note ?? null,
    })
  }
  if (total <= 0) return { error: tErr('orderTotalNotPositive') }
  return { orderLines, total, priceReviewRequired }
}

export async function getMyPointBalance(): Promise<number> {
  const session = await getSession()
  if (!session?.isMember) return 0
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  return getShopPointBalanceForMember(db, guildId, session)
}

export async function reviewShopOrder(
  lines: OrderLineInput[],
): Promise<ReviewShopOrderResult> {
  const tErr = await getTranslations('memberActionError')
  try {
    const session = await getSession()
    if (!session) return { ok: false, error: tErr('loginRequired') }
    if (!session.isMember) return { ok: false, error: tErr('memberOnlyOrder') }
    if (isLocalGuildAccountRestrictedFromResources(session)) {
      return { ok: false, error: tErr('localAccountResourceBlocked') }
    }
    const normalized = normalizeShopOrderInputs(lines, tErr)
    if ('error' in normalized) return { ok: false, error: normalized.error }
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()
    const priced = await resolveShopOrderPricing(db, guildId, normalized.lines, tErr)
    if ('error' in priced) return { ok: false, error: priced.error }
    const { spendable, error } = await getMemberSpendablePointBalance(
      db,
      guildId,
      session.discordId,
    )
    if (error) return { ok: false, error }
    if (spendable < priced.total) {
      return {
        ok: false,
        error: tErr('insufficientPointsWithDetail', {
          balance: spendable,
          total: priced.total,
        }),
      }
    }
    return {
      ok: true,
      balance: spendable,
      lines: priced.orderLines.map((line) => ({
        inventoryId: line.inventoryId,
        quantity: line.quantity,
        unitPoints: line.unitPoints,
        subtotalPoints: line.subtotalPoints,
        pricingSource: line.pricingSource,
      })),
    }
  } catch (e) {
    return { ok: false, error: await publicActionError(e, 'actions/shop-member') }
  }
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
    const trimmedNote = memberNote.trim()
    if (trimmedNote.length > MEMO_MAX) {
      return { ok: false, error: tErr('shopMemoTooLong', { max: MEMO_MAX }) }
    }

    const normalized = normalizeShopOrderInputs(lines, tErr)
    if ('error' in normalized) return { ok: false, error: normalized.error }
    const db = getAdminClient()
    const guildId = await getSessionGuildId(session)
    const priced = await resolveShopOrderPricing(db, guildId, normalized.lines, tErr)
    if ('error' in priced) return { ok: false, error: priced.error }
    const { orderLines, total, priceReviewRequired } = priced

    // 잔액 체크 (UX 용 사전 검증; approve RPC 에서 재확인함).
    const { spendable, error: balanceError } = await getMemberSpendablePointBalance(db, guildId, session.discordId)
    if (balanceError) return { ok: false, error: balanceError }
    if (spendable < total) {
      return { ok: false, error: tErr('insufficientPointsWithDetail', { balance: spendable, total }) }
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
      member_quote_evidence_url: null,
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
    if (rpcErr) return { ok: false, error: await publicActionError(rpcErr, 'actions/shop-member') }
    if (!orderId) return { ok: false, error: await publicActionMessage('actionFailed') }
    const orderIdString = orderId as string

    revalidateShopSurfaces(guildId)
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
    return { ok: false, error: await publicActionError(e, 'actions/shop-member') }
  }
}

export async function listMyShopOrders(limit = 20): Promise<MyOrderRow[]> {
  const session = await getSession()
  if (!session) return []
  if (isLocalGuildAccountRestrictedFromResources(session)) return []
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  return listShopOrdersForMember(db, guildId, session.discordId, limit)
}

export async function getMyShopOrderCounts(): Promise<MemberRequestCounts> {
  const session = await getSession()
  if (!session || isLocalGuildAccountRestrictedFromResources(session)) {
    return { total: 0, active: 0 }
  }
  const guildId = await getSessionGuildId(session)
  return countShopOrdersForMember(getAdminClient(), guildId, session.discordId)
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
      return { error: await publicActionError(error, 'actions/shop-member') }
    }
    revalidateShopSurfaces(guildId)
    revalidatePath('/me')
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/', 'layout')
    return {}
  } catch (e) {
    return { error: await publicActionError(e, 'actions/shop-member') }
  }
}
