'use server'


import { publicActionError } from '@/lib/public-action-error'
// 길드원 상점 액션 — 잔액 조회, 주문 제출, 본인 주문 조회.

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getSession } from '@/lib/session'
import { requireCurrentMutationSession } from '@/lib/auth'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { computePointPrice, parseShopDiscountRate } from '@/lib/shop/price'
import { getAppSetting } from '@/lib/app-settings'
import { getMemberSpendablePointBalance } from '@/lib/point-ledger'
import { isLocalGuildAccountRestrictedFromResources } from '@/lib/local-guild-account'
import {
  getAdminNotificationTranslations,
  sendAdminNotification,
} from '@/lib/admin-notifications'
import { getLocalizedItemName } from '@/lib/item-names'
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
import {
  executeShopOrderApplicationCommand,
} from '@/lib/shop-order-application-command'
import { ApplicationCommandError } from '@/lib/application-command'
import { isApplicationCommandIdempotencyKey } from '@/lib/application-command-idempotency'
import {
  isSameStableMemberOwner,
  resolveStableMemberOwnership,
} from '@/lib/stable-member-ownership'

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

async function loadOwnedShopOrder(
  db: ShopMemberDb,
  guildId: string,
  orderId: string,
  subjectId: string,
): Promise<{
  ownerSubjectId: string | null
  notOwned: boolean
  error: { message: string } | null
}> {
  const [{ data: order, error }, ownership] = await Promise.all([
    db
      .from('shop_orders')
      .select('discord_id, guild_member_id')
      .eq('guild_id', guildId)
      .eq('id', orderId)
      .maybeSingle(),
    resolveStableMemberOwnership(db, guildId, subjectId),
  ])
  if (error) return { ownerSubjectId: null, notOwned: false, error }
  if (ownership.error) {
    return { ownerSubjectId: null, notOwned: false, error: { message: ownership.error } }
  }
  if (!order || !isSameStableMemberOwner({
    currentGuildMemberId: ownership.guildMemberId,
    currentSubjectId: subjectId,
    rowGuildMemberId: order.guild_member_id,
    rowSubjectId: order.discord_id,
  })) {
    return { ownerSubjectId: null, notOwned: true, error: null }
  }
  return { ownerSubjectId: order.discord_id, notOwned: false, error: null }
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
    const session = await requireCurrentMutationSession().catch(() => null)
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
  idempotencyKey?: string,
): Promise<SubmitOrderResult> {
  const tErr = await getTranslations('memberActionError')
  try {
    const session = await requireCurrentMutationSession().catch(() => null)
    if (!session) return { ok: false, error: tErr('loginRequired') }
    if (!session.isMember) return { ok: false, error: tErr('memberOnlyOrder') }
    if (isLocalGuildAccountRestrictedFromResources(session)) {
      return { ok: false, error: tErr('localAccountResourceBlocked') }
    }
    const guildId = await getSessionGuildId(session)
    const commandId = isApplicationCommandIdempotencyKey(idempotencyKey)
      ? idempotencyKey
      : crypto.randomUUID()
    const command = await executeShopOrderApplicationCommand({
      guildId,
      actorDiscordId: session.discordId,
      actorUsername: session.username,
      source: 'web',
      correlationId: commandId,
      idempotencyKey: commandId,
    }, {
      lines,
      memberNote,
    })
    const {
      orderLines,
      total,
      priceReviewRequired,
      orderId: orderIdString,
    } = command

    revalidateShopSurfaces(guildId)
    revalidatePath('/me')
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/', 'layout')
    const { locale: notificationLocale, t: tAdminNotify } =
      await getAdminNotificationTranslations(guildId)
    const visibleOrderLines = orderLines.slice(0, SHOP_ADMIN_NOTIFICATION_ITEM_LIMIT)
    const itemSummaryLines = visibleOrderLines.map((line) => {
      const localizedName = getLocalizedItemName(
        line.uniqueName,
        notificationLocale,
        line.nameKo,
      ) ?? line.nameKo
      const item = compactText(
        line.enchant > 0 ? `${localizedName} .${line.enchant}` : localizedName,
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
    if (!command.replayed) {
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
    }
    return { ok: true, orderId: orderIdString }
  } catch (e) {
    if (e instanceof ApplicationCommandError) {
      const details = e.details
      const errorByCode: Partial<Record<string, string>> = {
        shop_cart_empty: tErr('cartEmpty'),
        shop_unknown_item: tErr('unknownItem'),
        shop_quantity_invalid: tErr('quantityMustBePositiveInt'),
        shop_quote_price_invalid: tErr('shopQuotePriceInvalid'),
        shop_quote_price_required: tErr('shopQuotePriceRequired'),
        shop_quote_duplicate_conflict: tErr('shopQuoteDuplicateConflict'),
        shop_price_changed: tErr('shopPriceChanged'),
        shop_invalid_amount: tErr('invalidAmount'),
        shop_total_not_positive: tErr('orderTotalNotPositive'),
      }
      if (e.code === 'shop_line_limit') {
        return { ok: false, error: tErr('orderLineLimit', { max: Number(details.max ?? MAX_LINES) }) }
      }
      if (e.code === 'shop_memo_too_long') {
        return { ok: false, error: tErr('shopMemoTooLong', { max: Number(details.max ?? MEMO_MAX) }) }
      }
      if (e.code === 'shop_quote_city_too_long') {
        return { ok: false, error: tErr('shopQuoteCityTooLong', { max: Number(details.max ?? QUOTE_CITY_MAX) }) }
      }
      if (e.code === 'shop_quote_note_too_long') {
        return { ok: false, error: tErr('shopQuoteNoteTooLong', { max: Number(details.max ?? QUOTE_NOTE_MAX) }) }
      }
      if (e.code === 'shop_stock_short') {
        return {
          ok: false,
          error: tErr('itemStockShort', {
            name: String(details.name ?? ''),
            stock: Number(details.stock ?? 0),
          }),
        }
      }
      if (e.code === 'shop_quote_required') {
        return { ok: false, error: tErr('itemPriceQuoteRequired', { name: String(details.name ?? '') }) }
      }
      if (e.code === 'shop_insufficient_balance') {
        return {
          ok: false,
          error: tErr('insufficientPointsWithDetail', {
            balance: Number(details.balance ?? 0),
            total: Number(details.total ?? 0),
          }),
        }
      }
      if (errorByCode[e.code]) return { ok: false, error: errorByCode[e.code] }
    }
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
    const session = await requireCurrentMutationSession().catch(() => null)
    if (!session) return { error: tErr('loginRequired') }
    if (isLocalGuildAccountRestrictedFromResources(session)) {
      return { error: tErr('localAccountResourceBlocked') }
    }
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()
    const owned = await loadOwnedShopOrder(db, guildId, orderId, session.discordId)
    if (owned.error) {
      return { error: await publicActionError(owned.error, 'actions/shop-member') }
    }
    if (owned.notOwned || !owned.ownerSubjectId) {
      return { error: tErr('requestNotFound') }
    }
    const { error } = await db.rpc('cancel_shop_order', {
      p_id: orderId,
      p_guild_id: guildId,
      p_discord_id: owned.ownerSubjectId,
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

export async function confirmMyShopOrderPriceReview(
  reviewId: string,
  idempotencyKey: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  try {
    const session = await requireCurrentMutationSession().catch(() => null)
    if (!session) return { error: tErr('loginRequired') }
    if (!session.isMember) return { error: tErr('memberOnlyOrder') }
    if (isLocalGuildAccountRestrictedFromResources(session)) {
      return { error: tErr('localAccountResourceBlocked') }
    }
    if (!isApplicationCommandIdempotencyKey(idempotencyKey)) {
      return { error: tErr('invalidInput') }
    }
    const guildId = await getSessionGuildId(session)
    const db = getAdminClient()
    const { data: review, error: reviewError } = await db
      .from('shop_order_price_reviews')
      .select('order_id')
      .eq('guild_id', guildId)
      .eq('id', reviewId)
      .maybeSingle()
    if (reviewError) {
      return { error: await publicActionError(reviewError, 'actions/shop-member') }
    }
    if (!review) return { error: tErr('shopPriceReviewNotFound') }
    const owned = await loadOwnedShopOrder(
      db,
      guildId,
      review.order_id as string,
      session.discordId,
    )
    if (owned.error) {
      return { error: await publicActionError(owned.error, 'actions/shop-member') }
    }
    if (owned.notOwned || !owned.ownerSubjectId) {
      return { error: tErr('shopPriceReviewNotFound') }
    }
    const { error } = await db.rpc('confirm_shop_order_price_review', {
      p_guild_id: guildId,
      p_review_id: reviewId,
      p_discord_id: owned.ownerSubjectId,
      p_idempotency_key: idempotencyKey,
    })
    if (error) {
      if (error.message.includes('INSUFFICIENT_BALANCE')) {
        return { error: tErr('shopPriceReviewInsufficientPoints') }
      }
      if (
        error.message.includes('PRICE_REVIEW_NOT_OWNED') ||
        error.message.includes('PRICE_REVIEW_NOT_FOUND')
      ) {
        return { error: tErr('shopPriceReviewNotFound') }
      }
      if (
        error.message.includes('PRICE_REVIEW_NOT_CONFIRMABLE') ||
        error.message.includes('PRICE_REVIEW_STALE')
      ) {
        return { error: tErr('shopPriceReviewChanged') }
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
