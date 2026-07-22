'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { requireAnyCapability } from '@/lib/auth'
import { requireAlbionVerified } from '@/lib/albion-identity'
import { isLocalGuildAccountRestrictedFromResources } from '@/lib/local-guild-account'
import { logAdminAction } from '@/lib/admin-audit'
import { CAP } from '@/lib/permissions'
import { resolveAlbionItem } from '@/lib/shop/resolve-item'
import {
  defaultMemberTradeExpiresAt,
  isMemberTradeListingPurchasable,
  isMemberTradeListingLifecycleAction,
  isMemberTradeUuid,
  MEMBER_TRADE_CITY_MAX_LENGTH,
  MEMBER_TRADE_DELIVERY_NOTE_MAX_LENGTH,
  MEMBER_TRADE_DISPUTE_REASON_MAX_LENGTH,
  MEMBER_TRADE_MAX_ITEMS_PER_POST,
  MEMBER_TRADE_MEMO_MAX_LENGTH,
  MEMBER_TRADE_POST_DESCRIPTION_MAX_LENGTH,
  normalizeMemberTradePriceOfferItems,
  normalizeMemberTradePurchaseItems,
  normalizeMemberTradeQuantity,
  normalizeMemberTradeUnitPoints,
  sanitizeMemberTradeTitle,
  sanitizeMemberTradeText,
  type MemberTradeListingStatus,
  type MemberTradeListingLifecycleAction,
  type MemberTradeOrderStatus,
  type MemberTradePriceOfferStatus,
  type NormalizedMemberTradePriceOfferItem,
  type NormalizedMemberTradePurchaseItem,
} from '@/lib/member-trade'
import { getMemberSpendablePointSummary } from '@/lib/point-ledger'
import {
  countMemberTradeOrdersForMember,
  type MemberRequestCounts,
} from '@/lib/member-request-counts'

const MEMBER_TRADE_PAGE_LIMIT = 200
const MEMBER_TRADE_REVIEW_CAPS = [CAP.INVENTORY_DELIVER, CAP.INVENTORY_MANAGE] as const
const MEMBER_TRADE_ADMIN_NOTE_MAX_LENGTH = 1000

export interface CreateMemberTradeListingInput {
  title: string
  description?: string | null
  items: CreateMemberTradeListingItemInput[]
  city?: string | null
  deliveryNote?: string | null
}

export interface CreateMemberTradeListingItemInput {
  itemQuery: string
  enchant: number
  quality?: number | null
  quantity: number
  unitPoints: number
}

interface ResolvedMemberTradeListingItemPayload {
  uniqueName: string
  enchant: number
  quality: number | null
  nameKo: string
  category: string | null
  tier: number | null
  quantity: number
  unitPoints: number
  sortOrder: number
}

export interface MemberTradeListingItemRow {
  id: string
  uniqueName: string
  enchant: number
  quality: number | null
  nameKo: string
  category: string | null
  tier: number | null
  quantityAvailable: number
  unitPoints: number
  sortOrder: number
}

export interface MemberTradeListingRow {
  id: string
  title: string
  description: string | null
  sellerDiscordId: string
  sellerUsername: string
  uniqueName: string
  enchant: number
  quality: number | null
  nameKo: string
  category: string | null
  tier: number | null
  quantityAvailable: number
  unitPoints: number
  status: MemberTradeListingStatus
  city: string | null
  deliveryNote: string | null
  expiresAt: string | null
  createdAt: string
  isMine: boolean
  itemCount: number
  items: MemberTradeListingItemRow[]
}

export interface MemberTradeOrderItemRow {
  id: string
  listingItemId: string | null
  uniqueName: string
  enchant: number
  quality: number | null
  nameKo: string
  quantity: number
  unitPoints: number
  totalPoints: number
  sortOrder: number
}

export interface MemberTradeOrderRow {
  id: string
  listingId: string
  listingTitle: string | null
  buyerDiscordId: string
  buyerUsername: string
  sellerDiscordId: string
  sellerUsername: string
  uniqueName: string
  enchant: number
  quality: number | null
  nameKo: string
  quantity: number
  unitPoints: number
  totalPoints: number
  status: MemberTradeOrderStatus
  buyerNote: string | null
  sellerDeliveryNote: string | null
  disputeReason: string | null
  adminNote: string | null
  deliveryDueAt: string
  deliveredAt: string | null
  completedAt: string | null
  createdAt: string
  relation: 'buyer' | 'seller'
  items: MemberTradeOrderItemRow[]
}

export interface MemberTradePriceOfferItemRow {
  id: string
  listingItemId: string | null
  uniqueName: string
  enchant: number
  quality: number | null
  nameKo: string
  quantity: number
  offeredUnitPoints: number
  offeredTotalPoints: number
  sortOrder: number
}

export interface MemberTradePriceOfferRow {
  id: string
  listingId: string
  listingTitle: string
  buyerDiscordId: string
  buyerUsername: string
  sellerDiscordId: string
  sellerUsername: string
  status: MemberTradePriceOfferStatus
  totalPoints: number
  buyerNote: string | null
  sellerNote: string | null
  acceptedOrderId: string | null
  expiresAt: string
  createdAt: string
  respondedAt: string | null
  relation: 'buyer' | 'seller'
  items: MemberTradePriceOfferItemRow[]
}

export interface MemberTradePointSummaryRow {
  balance: number
  escrowed: number
  spendable: number
}

export interface AdminMemberTradeDisputeRow {
  id: string
  listingTitle: string | null
  buyerDiscordId: string
  buyerUsername: string
  sellerDiscordId: string
  sellerUsername: string
  uniqueName: string
  enchant: number
  quality: number | null
  nameKo: string
  quantity: number
  unitPoints: number
  totalPoints: number
  status: MemberTradeOrderStatus
  buyerNote: string | null
  sellerDeliveryNote: string | null
  disputeReason: string | null
  adminNote: string | null
  deliveredAt: string | null
  completedAt: string | null
  createdAt: string
  items: MemberTradeOrderItemRow[]
}

function mapMemberTradeRpcError(
  message: string,
  tErr: Awaited<ReturnType<typeof getTranslations<'memberActionError'>>>,
): string {
  if (message.includes('INSUFFICIENT_BALANCE')) return tErr('memberTradeInsufficientSpendable')
  if (message.includes('SELF_TRADE')) return tErr('memberTradeSelfTrade')
  if (message.includes('LISTING_NOT_FOUND')) return tErr('memberTradeListingUnavailable')
  if (message.includes('LISTING_NOT_PURCHASABLE')) return tErr('memberTradeListingUnavailable')
  if (message.includes('LISTING_ITEM_NOT_FOUND')) return tErr('memberTradeListingUnavailable')
  if (message.includes('INVALID_LISTING_LIFECYCLE_ACTION')) return tErr('invalidInput')
  if (message.includes('LISTING_STATUS_NOT_ACTIVE')) return tErr('memberTradeListingStateInvalid')
  if (message.includes('LISTING_STATUS_NOT_PAUSED')) return tErr('memberTradeListingStateInvalid')
  if (message.includes('LISTING_CANNOT_RESUME')) return tErr('memberTradeListingCannotResume')
  if (message.includes('LISTING_CANNOT_CLOSE')) return tErr('memberTradeListingStateInvalid')
  if (message.includes('BUYER_NOT_MEMBER')) return tErr('memberTradeBuyerNotMember')
  if (message.includes('OFFER_NOT_PENDING')) return tErr('memberTradeOfferNotPending')
  if (message.includes('INVALID_TITLE')) return tErr('memberTradeTitleRequired')
  if (message.includes('INVALID_ITEMS')) return tErr('memberTradeItemsRequired')
  if (message.includes('INVALID_QUANTITY')) return tErr('memberTradeInvalidQuantity')
  if (message.includes('INVALID_TOTAL_POINTS')) return tErr('memberTradeInvalidPrice')
  if (message.includes('ORDER_NOT_AWAITING_DELIVERY')) return tErr('memberTradeOrderNotAwaitingDelivery')
  if (message.includes('ORDER_NOT_DELIVERED')) return tErr('memberTradeOrderNotDelivered')
  if (message.includes('ORDER_NOT_CANCELLABLE')) return tErr('memberTradeOrderNotCancellable')
  if (message.includes('ORDER_NOT_DISPUTABLE')) return tErr('memberTradeOrderNotDisputable')
  if (message.includes('ESCROW_NOT_HELD')) return tErr('memberTradeEscrowNotHeld')
  return message
}

function mapAdminMemberTradeRpcError(
  message: string,
  tErr: Awaited<ReturnType<typeof getTranslations<'adminActionError'>>>,
): string {
  if (message.includes('ORDER_NOT_DISPUTED')) return tErr('memberTradeOrderNotDisputed')
  if (message.includes('ESCROW_NOT_HELD')) return tErr('memberTradeEscrowNotHeld')
  return message
}

function validateQuality(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  return Number.isInteger(value) && value >= 1 && value <= 5 ? value : null
}

function validateEnchant(value: number): number | null {
  return Number.isInteger(value) && value >= 0 && value <= 4 ? value : null
}

function mapListingItemRow(row: Record<string, unknown>): MemberTradeListingItemRow {
  return {
    id: row.id as string,
    uniqueName: row.unique_name as string,
    enchant: row.enchant as number,
    quality: (row.quality as number | null) ?? null,
    nameKo: row.name_ko as string,
    category: (row.category as string | null) ?? null,
    tier: (row.tier as number | null) ?? null,
    quantityAvailable: row.quantity_available as number,
    unitPoints: row.unit_points as number,
    sortOrder: row.sort_order as number,
  }
}

function mapOrderItemRow(row: Record<string, unknown>): MemberTradeOrderItemRow {
  return {
    id: row.id as string,
    listingItemId: (row.listing_item_id as string | null) ?? null,
    uniqueName: row.unique_name as string,
    enchant: row.enchant as number,
    quality: (row.quality as number | null) ?? null,
    nameKo: row.name_ko as string,
    quantity: row.quantity as number,
    unitPoints: row.unit_points as number,
    totalPoints: row.total_points as number,
    sortOrder: row.sort_order as number,
  }
}

function mapOfferItemRow(row: Record<string, unknown>): MemberTradePriceOfferItemRow {
  return {
    id: row.id as string,
    listingItemId: (row.listing_item_id as string | null) ?? null,
    uniqueName: row.unique_name as string,
    enchant: row.enchant as number,
    quality: (row.quality as number | null) ?? null,
    nameKo: row.name_ko as string,
    quantity: row.quantity as number,
    offeredUnitPoints: row.offered_unit_points as number,
    offeredTotalPoints: row.offered_total_points as number,
    sortOrder: row.sort_order as number,
  }
}

function fallbackListingItem(row: Record<string, unknown>): MemberTradeListingItemRow {
  return {
    id: row.id as string,
    uniqueName: row.unique_name as string,
    enchant: row.enchant as number,
    quality: (row.quality as number | null) ?? null,
    nameKo: row.name_ko as string,
    category: (row.category as string | null) ?? null,
    tier: (row.tier as number | null) ?? null,
    quantityAvailable: row.quantity_available as number,
    unitPoints: row.unit_points as number,
    sortOrder: 0,
  }
}

function fallbackOrderItem(row: Record<string, unknown>): MemberTradeOrderItemRow {
  return {
    id: row.id as string,
    listingItemId: (row.listing_id as string | null) ?? null,
    uniqueName: row.unique_name as string,
    enchant: row.enchant as number,
    quality: (row.quality as number | null) ?? null,
    nameKo: row.name_ko as string,
    quantity: row.quantity as number,
    unitPoints: row.unit_points as number,
    totalPoints: row.total_points as number,
    sortOrder: 0,
  }
}

async function requireMemberTradeSession() {
  const tErr = await getTranslations('memberActionError')
  const session = await getSession()
  if (!session) return { error: tErr('loginRequired') as string, session: null, guildId: null }
  if (!session.isMember) return { error: tErr('memberOnly') as string, session: null, guildId: null }
  if (isLocalGuildAccountRestrictedFromResources(session)) {
    return { error: tErr('localAccountResourceBlocked') as string, session: null, guildId: null }
  }
  const guildId = await getSessionGuildId(session)
  const albionError = await requireAlbionVerified(session.discordId, guildId)
  if (albionError) return { error: albionError, session: null, guildId: null }
  return { session, guildId, error: null }
}

export async function listMemberTradeListings(): Promise<{
  listings: MemberTradeListingRow[]
  error?: string
}> {
  const session = await getSession()
  const guildId = session ? await getSessionGuildId(session) : null
  if (!guildId) return { listings: [] }
  const db = getAdminClient()
  const listingSelect =
    'id, title, description, seller_discord_id, seller_username, unique_name, enchant, quality, name_ko, category, tier, quantity_available, unit_points, status, city, delivery_note, expires_at, created_at, item_count'
  const [publicListingsResult, ownListingsResult] = await Promise.all([
    db
      .from('member_trade_listings')
      .select(listingSelect)
      .eq('guild_id', guildId)
      .eq('status', 'active')
      .gt('quantity_available', 0)
      .order('created_at', { ascending: false })
      .limit(MEMBER_TRADE_PAGE_LIMIT),
    session
      ? db
          .from('member_trade_listings')
          .select(listingSelect)
          .eq('guild_id', guildId)
          .eq('seller_discord_id', session.discordId)
          .order('created_at', { ascending: false })
          .limit(MEMBER_TRADE_PAGE_LIMIT)
      : Promise.resolve({ data: [], error: null }),
  ])
  const queryError = publicListingsResult.error ?? ownListingsResult.error
  if (queryError) {
    if (/member_trade_listings|does not exist|schema cache/i.test(queryError.message)) {
      return { listings: [] }
    }
    return { listings: [], error: queryError.message }
  }

  const now = new Date()
  const purchasablePublicRows = (publicListingsResult.data ?? []).filter((row) =>
    isMemberTradeListingPurchasable({
      status: row.status as MemberTradeListingStatus,
      quantityAvailable: Number(row.quantity_available) || 0,
      expiresAt: (row.expires_at as string | null) ?? null,
      now,
    }),
  )
  const candidateRowsById = new Map<string, Record<string, unknown>>()
  for (const row of purchasablePublicRows) {
    candidateRowsById.set(row.id as string, row)
  }
  // A seller needs to manage paused, sold-out, closed, and expired listings
  // too. Those rows remain private to the seller while active listings retain
  // the existing public market filter.
  for (const row of ownListingsResult.data ?? []) {
    candidateRowsById.set(row.id as string, row)
  }
  const candidateRows = [...candidateRowsById.values()].sort((left, right) =>
    String(right.created_at).localeCompare(String(left.created_at)),
  )
  const listingIds = candidateRows.map((row) => row.id as string)
  const itemsByListing = new Map<string, MemberTradeListingItemRow[]>()
  if (listingIds.length > 0) {
    const { data: itemRows, error: itemError } = await db
      .from('member_trade_listing_items')
      .select(
        'id, listing_id, unique_name, enchant, quality, name_ko, category, tier, quantity_available, unit_points, sort_order',
      )
      .eq('guild_id', guildId)
      .in('listing_id', listingIds)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (itemError && !/member_trade_listing_items|does not exist|schema cache/i.test(itemError.message)) {
      return { listings: [], error: itemError.message }
    }

    for (const row of itemRows ?? []) {
      const listingId = row.listing_id as string
      const current = itemsByListing.get(listingId) ?? []
      itemsByListing.set(listingId, [...current, mapListingItemRow(row)])
    }
  }

  return {
    listings: candidateRows.map((row) => {
      const items = itemsByListing.get(row.id as string) ?? [fallbackListingItem(row)]
      return {
        id: row.id as string,
        title: ((row.title as string | null) ?? row.name_ko) as string,
        description: (row.description as string | null) ?? null,
        sellerDiscordId: row.seller_discord_id as string,
        sellerUsername: row.seller_username as string,
        uniqueName: row.unique_name as string,
        enchant: row.enchant as number,
        quality: (row.quality as number | null) ?? null,
        nameKo: row.name_ko as string,
        category: (row.category as string | null) ?? null,
        tier: (row.tier as number | null) ?? null,
        quantityAvailable: row.quantity_available as number,
        unitPoints: row.unit_points as number,
        status: row.status as MemberTradeListingStatus,
        city: (row.city as string | null) ?? null,
        deliveryNote: (row.delivery_note as string | null) ?? null,
        expiresAt: (row.expires_at as string | null) ?? null,
        createdAt: row.created_at as string,
        isMine: row.seller_discord_id === session?.discordId,
        itemCount: Math.max(Number(row.item_count) || items.length, items.length),
        items,
      }
    }),
  }
}

export async function listMyMemberTradeOrders(): Promise<{
  orders: MemberTradeOrderRow[]
  error?: string
}> {
  const session = await getSession()
  if (!session) return { orders: [] }
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const { data, error } = await db
    .from('member_trade_orders')
    .select(
      'id, listing_id, listing_title, buyer_discord_id, buyer_username, seller_discord_id, seller_username, unique_name, enchant, quality, name_ko, quantity, unit_points, total_points, status, buyer_note, seller_delivery_note, dispute_reason, admin_note, delivery_due_at, delivered_at, completed_at, created_at',
    )
    .eq('guild_id', guildId)
    .or(`buyer_discord_id.eq.${session.discordId},seller_discord_id.eq.${session.discordId}`)
    .order('created_at', { ascending: false })
    .limit(MEMBER_TRADE_PAGE_LIMIT)
  if (error) {
    if (/member_trade_orders|does not exist|schema cache/i.test(error.message)) {
      return { orders: [] }
    }
    return { orders: [], error: error.message }
  }

  const orderIds = (data ?? []).map((row) => row.id as string)
  const itemsByOrder = new Map<string, MemberTradeOrderItemRow[]>()
  if (orderIds.length > 0) {
    const { data: itemRows, error: itemError } = await db
      .from('member_trade_order_items')
      .select(
        'id, order_id, listing_item_id, unique_name, enchant, quality, name_ko, quantity, unit_points, total_points, sort_order',
      )
      .eq('guild_id', guildId)
      .in('order_id', orderIds)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (itemError && !/member_trade_order_items|does not exist|schema cache/i.test(itemError.message)) {
      return { orders: [], error: itemError.message }
    }

    for (const row of itemRows ?? []) {
      const orderId = row.order_id as string
      const current = itemsByOrder.get(orderId) ?? []
      itemsByOrder.set(orderId, [...current, mapOrderItemRow(row)])
    }
  }

  return {
    orders: (data ?? []).map((row) => ({
      id: row.id as string,
      listingId: row.listing_id as string,
      listingTitle: (row.listing_title as string | null) ?? null,
      buyerDiscordId: row.buyer_discord_id as string,
      buyerUsername: row.buyer_username as string,
      sellerDiscordId: row.seller_discord_id as string,
      sellerUsername: row.seller_username as string,
      uniqueName: row.unique_name as string,
      enchant: row.enchant as number,
      quality: (row.quality as number | null) ?? null,
      nameKo: row.name_ko as string,
      quantity: row.quantity as number,
      unitPoints: row.unit_points as number,
      totalPoints: row.total_points as number,
      status: row.status as MemberTradeOrderStatus,
      buyerNote: (row.buyer_note as string | null) ?? null,
      sellerDeliveryNote: (row.seller_delivery_note as string | null) ?? null,
      disputeReason: (row.dispute_reason as string | null) ?? null,
      adminNote: (row.admin_note as string | null) ?? null,
      deliveryDueAt: row.delivery_due_at as string,
      deliveredAt: (row.delivered_at as string | null) ?? null,
      completedAt: (row.completed_at as string | null) ?? null,
      createdAt: row.created_at as string,
      relation: row.buyer_discord_id === session.discordId ? 'buyer' : 'seller',
      items: itemsByOrder.get(row.id as string) ?? [fallbackOrderItem(row)],
    })),
  }
}

export async function getMyMemberTradeOrderCounts(): Promise<MemberRequestCounts> {
  const session = await getSession()
  if (!session) return { total: 0, active: 0 }
  const guildId = await getSessionGuildId(session)
  const counts = await countMemberTradeOrdersForMember(
    getAdminClient(),
    guildId,
    session.discordId,
  )
  if (counts.error && /member_trade_orders|does not exist|schema cache/i.test(counts.error)) {
    return { total: 0, active: 0 }
  }
  return counts
}

export async function listMyMemberTradePriceOffers(): Promise<{
  offers: MemberTradePriceOfferRow[]
  error?: string
}> {
  const session = await getSession()
  if (!session) return { offers: [] }
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const { data, error } = await db
    .from('member_trade_price_offers')
    .select(
      'id, listing_id, listing_title, buyer_discord_id, buyer_username, seller_discord_id, seller_username, status, total_points, buyer_note, seller_note, accepted_order_id, expires_at, created_at, responded_at',
    )
    .eq('guild_id', guildId)
    .or(`buyer_discord_id.eq.${session.discordId},seller_discord_id.eq.${session.discordId}`)
    .order('created_at', { ascending: false })
    .limit(MEMBER_TRADE_PAGE_LIMIT)
  if (error) {
    if (/member_trade_price_offers|does not exist|schema cache/i.test(error.message)) {
      return { offers: [] }
    }
    return { offers: [], error: error.message }
  }

  const offerIds = (data ?? []).map((row) => row.id as string)
  const itemsByOffer = new Map<string, MemberTradePriceOfferItemRow[]>()
  if (offerIds.length > 0) {
    const { data: itemRows, error: itemError } = await db
      .from('member_trade_price_offer_items')
      .select(
        'id, offer_id, listing_item_id, unique_name, enchant, quality, name_ko, quantity, offered_unit_points, offered_total_points, sort_order',
      )
      .eq('guild_id', guildId)
      .in('offer_id', offerIds)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (itemError && !/member_trade_price_offer_items|does not exist|schema cache/i.test(itemError.message)) {
      return { offers: [], error: itemError.message }
    }

    for (const row of itemRows ?? []) {
      const offerId = row.offer_id as string
      const current = itemsByOffer.get(offerId) ?? []
      itemsByOffer.set(offerId, [...current, mapOfferItemRow(row)])
    }
  }

  return {
    offers: (data ?? []).map((row) => ({
      id: row.id as string,
      listingId: row.listing_id as string,
      listingTitle: row.listing_title as string,
      buyerDiscordId: row.buyer_discord_id as string,
      buyerUsername: row.buyer_username as string,
      sellerDiscordId: row.seller_discord_id as string,
      sellerUsername: row.seller_username as string,
      status: row.status as MemberTradePriceOfferStatus,
      totalPoints: row.total_points as number,
      buyerNote: (row.buyer_note as string | null) ?? null,
      sellerNote: (row.seller_note as string | null) ?? null,
      acceptedOrderId: (row.accepted_order_id as string | null) ?? null,
      expiresAt: row.expires_at as string,
      createdAt: row.created_at as string,
      respondedAt: (row.responded_at as string | null) ?? null,
      relation: row.buyer_discord_id === session.discordId ? 'buyer' : 'seller',
      items: itemsByOffer.get(row.id as string) ?? [],
    })),
  }
}

export async function getMyMemberTradePointSummary(): Promise<MemberTradePointSummaryRow> {
  const session = await getSession()
  if (!session?.isMember) return { balance: 0, escrowed: 0, spendable: 0 }
  const guildId = await getSessionGuildId(session)
  const db = getAdminClient()
  const { summary } = await getMemberSpendablePointSummary(db, guildId, session.discordId)
  return {
    balance: summary.balance,
    escrowed: summary.escrowed,
    spendable: summary.spendable,
  }
}

export async function createMemberTradeListing(
  input: CreateMemberTradeListingInput,
): Promise<{ id?: string; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const required = await requireMemberTradeSession()
  if (required.error || !required.session || !required.guildId) {
    return { error: required.error ?? tErr('serverError') }
  }

  const title = sanitizeMemberTradeTitle(input.title)
  if (!title) return { error: tErr('memberTradeTitleRequired') }
  if (
    !Array.isArray(input.items) ||
    input.items.length === 0 ||
    input.items.length > MEMBER_TRADE_MAX_ITEMS_PER_POST
  ) {
    return { error: tErr('memberTradeItemsRequired') }
  }

  const resolvedItems: ResolvedMemberTradeListingItemPayload[] = []
  for (const [index, item] of input.items.entries()) {
    const itemQuery = sanitizeMemberTradeText(item.itemQuery, 120)
    if (!itemQuery) return { error: tErr('memberTradeItemRequired') }
    const resolved = resolveAlbionItem(itemQuery)
    if (!resolved) return { error: tErr('memberTradeItemUnresolved') }

    const enchant = validateEnchant(Number(item.enchant))
    if (enchant === null) return { error: tErr('memberTradeInvalidEnchant') }
    const quality = validateQuality(item.quality)
    const quantity = normalizeMemberTradeQuantity(item.quantity)
    if (quantity === null) return { error: tErr('memberTradeInvalidQuantity') }
    const unitPoints = normalizeMemberTradeUnitPoints(item.unitPoints)
    if (unitPoints === null) return { error: tErr('memberTradeInvalidPrice') }
    if (unitPoints > Math.floor(2_147_483_647 / quantity)) {
      return { error: tErr('invalidAmount') }
    }

    resolvedItems.push({
      uniqueName: resolved.uniqueName,
      enchant,
      quality,
      nameKo: resolved.nameKo,
      category: resolved.category,
      tier: resolved.tier,
      quantity,
      unitPoints,
      sortOrder: index,
    })
  }

  const city = sanitizeMemberTradeText(input.city, MEMBER_TRADE_CITY_MAX_LENGTH)
  const description = sanitizeMemberTradeText(
    input.description,
    MEMBER_TRADE_POST_DESCRIPTION_MAX_LENGTH,
  )
  const deliveryNote = sanitizeMemberTradeText(
    input.deliveryNote,
    MEMBER_TRADE_DELIVERY_NOTE_MAX_LENGTH,
  )

  const db = getAdminClient()
  const { data, error } = await db.rpc('create_member_trade_listing_post', {
    p_guild_id: required.guildId,
    p_seller_discord_id: required.session.discordId,
    p_seller_username: required.session.username,
    p_title: title,
    p_description: description,
    p_city: city,
    p_delivery_note: deliveryNote,
    p_expires_at: defaultMemberTradeExpiresAt(),
    p_items: resolvedItems,
  })
  if (error) return { error: mapMemberTradeRpcError(error.message, tErr) }

  revalidatePath('/market')
  revalidatePath('/me')
  return { id: typeof data === 'string' ? data : undefined }
}

export async function updateMemberTradeListingLifecycle(
  listingId: string,
  action: MemberTradeListingLifecycleAction,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const required = await requireMemberTradeSession()
  if (required.error || !required.session || !required.guildId) {
    return { error: required.error ?? tErr('serverError') }
  }
  if (!isMemberTradeUuid(listingId) || !isMemberTradeListingLifecycleAction(action)) {
    return { error: tErr('invalidInput') }
  }

  const db = getAdminClient()
  const { error } = await db.rpc('update_member_trade_listing_lifecycle', {
    p_listing_id: listingId,
    p_guild_id: required.guildId,
    p_seller_discord_id: required.session.discordId,
    p_action: action,
  })
  if (error) return { error: mapMemberTradeRpcError(error.message, tErr) }

  revalidatePath('/market')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  return {}
}

export async function buyMemberTradeListing(
  listingId: string,
  items: NormalizedMemberTradePurchaseItem[],
  buyerNote?: string,
): Promise<{ id?: string; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const required = await requireMemberTradeSession()
  if (required.error || !required.session || !required.guildId) {
    return { error: required.error ?? tErr('serverError') }
  }
  const normalizedItems = normalizeMemberTradePurchaseItems(items)
  if (!normalizedItems) return { error: tErr('memberTradeInvalidQuantity') }
  const note = sanitizeMemberTradeText(buyerNote, MEMBER_TRADE_MEMO_MAX_LENGTH)

  const db = getAdminClient()
  const { data, error } = await db.rpc('buy_member_trade_listing_items', {
    p_listing_id: listingId,
    p_guild_id: required.guildId,
    p_buyer_discord_id: required.session.discordId,
    p_buyer_username: required.session.username,
    p_items: normalizedItems,
    p_buyer_note: note,
  })
  if (error) return { error: mapMemberTradeRpcError(error.message, tErr) }

  revalidatePath('/market')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  return { id: typeof data === 'string' ? data : undefined }
}

export async function createMemberTradePriceOffer(
  listingId: string,
  items: NormalizedMemberTradePriceOfferItem[],
  buyerNote?: string,
): Promise<{ id?: string; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const required = await requireMemberTradeSession()
  if (required.error || !required.session || !required.guildId) {
    return { error: required.error ?? tErr('serverError') }
  }
  const normalizedItems = normalizeMemberTradePriceOfferItems(items)
  if (!normalizedItems) return { error: tErr('memberTradeInvalidPrice') }
  const note = sanitizeMemberTradeText(buyerNote, MEMBER_TRADE_MEMO_MAX_LENGTH)

  const db = getAdminClient()
  const { data, error } = await db.rpc('create_member_trade_price_offer', {
    p_listing_id: listingId,
    p_guild_id: required.guildId,
    p_buyer_discord_id: required.session.discordId,
    p_buyer_username: required.session.username,
    p_items: normalizedItems,
    p_buyer_note: note,
  })
  if (error) return { error: mapMemberTradeRpcError(error.message, tErr) }

  revalidatePath('/market')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  return { id: typeof data === 'string' ? data : undefined }
}

export async function acceptMemberTradePriceOffer(
  offerId: string,
): Promise<{ id?: string; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const required = await requireMemberTradeSession()
  if (required.error || !required.session || !required.guildId) {
    return { error: required.error ?? tErr('serverError') }
  }

  const db = getAdminClient()
  const { data, error } = await db.rpc('accept_member_trade_price_offer', {
    p_offer_id: offerId,
    p_guild_id: required.guildId,
    p_seller_discord_id: required.session.discordId,
  })
  if (error) return { error: mapMemberTradeRpcError(error.message, tErr) }

  revalidatePath('/market')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  return { id: typeof data === 'string' ? data : undefined }
}

export async function declineMemberTradePriceOffer(
  offerId: string,
  sellerNote?: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const required = await requireMemberTradeSession()
  if (required.error || !required.session || !required.guildId) {
    return { error: required.error ?? tErr('serverError') }
  }
  const note = sanitizeMemberTradeText(sellerNote, MEMBER_TRADE_MEMO_MAX_LENGTH)

  const db = getAdminClient()
  const { error } = await db.rpc('decline_member_trade_price_offer', {
    p_offer_id: offerId,
    p_guild_id: required.guildId,
    p_seller_discord_id: required.session.discordId,
    p_seller_note: note,
  })
  if (error) return { error: mapMemberTradeRpcError(error.message, tErr) }

  revalidatePath('/market')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  return {}
}

export async function cancelMemberTradePriceOffer(offerId: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const required = await requireMemberTradeSession()
  if (required.error || !required.session || !required.guildId) {
    return { error: required.error ?? tErr('serverError') }
  }

  const db = getAdminClient()
  const { error } = await db.rpc('cancel_member_trade_price_offer', {
    p_offer_id: offerId,
    p_guild_id: required.guildId,
    p_buyer_discord_id: required.session.discordId,
  })
  if (error) return { error: mapMemberTradeRpcError(error.message, tErr) }

  revalidatePath('/market')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  return {}
}

export async function markMemberTradeDelivered(
  orderId: string,
  deliveryNote?: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const required = await requireMemberTradeSession()
  if (required.error || !required.session || !required.guildId) {
    return { error: required.error ?? tErr('serverError') }
  }
  const note = sanitizeMemberTradeText(deliveryNote, MEMBER_TRADE_DELIVERY_NOTE_MAX_LENGTH)
  const db = getAdminClient()
  const { error } = await db.rpc('mark_member_trade_delivered', {
    p_order_id: orderId,
    p_guild_id: required.guildId,
    p_seller_discord_id: required.session.discordId,
    p_delivery_note: note,
  })
  if (error) return { error: mapMemberTradeRpcError(error.message, tErr) }
  revalidatePath('/market')
  revalidatePath('/me')
  return {}
}

export async function confirmMemberTradeReceived(orderId: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const required = await requireMemberTradeSession()
  if (required.error || !required.session || !required.guildId) {
    return { error: required.error ?? tErr('serverError') }
  }
  const db = getAdminClient()
  const { error } = await db.rpc('complete_member_trade_order', {
    p_order_id: orderId,
    p_guild_id: required.guildId,
    p_buyer_discord_id: required.session.discordId,
  })
  if (error) return { error: mapMemberTradeRpcError(error.message, tErr) }
  revalidatePath('/market')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  return {}
}

export async function cancelMemberTradeOrder(orderId: string): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const required = await requireMemberTradeSession()
  if (required.error || !required.session || !required.guildId) {
    return { error: required.error ?? tErr('serverError') }
  }
  const db = getAdminClient()
  const { error } = await db.rpc('cancel_member_trade_order', {
    p_order_id: orderId,
    p_guild_id: required.guildId,
    p_actor_discord_id: required.session.discordId,
  })
  if (error) return { error: mapMemberTradeRpcError(error.message, tErr) }
  revalidatePath('/market')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  return {}
}

export async function openMemberTradeDispute(
  orderId: string,
  reason: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const required = await requireMemberTradeSession()
  if (required.error || !required.session || !required.guildId) {
    return { error: required.error ?? tErr('serverError') }
  }
  const note = sanitizeMemberTradeText(reason, MEMBER_TRADE_DISPUTE_REASON_MAX_LENGTH)
  if (!note) return { error: tErr('memberTradeDisputeReasonRequired') }
  const db = getAdminClient()
  const { error } = await db.rpc('open_member_trade_dispute', {
    p_order_id: orderId,
    p_guild_id: required.guildId,
    p_buyer_discord_id: required.session.discordId,
    p_reason: note,
  })
  if (error) return { error: mapMemberTradeRpcError(error.message, tErr) }
  revalidatePath('/market')
  revalidatePath('/me')
  revalidatePath('/admin/dashboard/approvals')
  return {}
}

export async function listAdminMemberTradeDisputes(
  scope: 'pending' | 'all' = 'pending',
): Promise<{ disputes: AdminMemberTradeDisputeRow[]; error?: string }> {
  try {
    const session = await getSession()
    if (!session) return { disputes: [], error: 'Unauthorized' }
    const db = await requireAnyCapability(MEMBER_TRADE_REVIEW_CAPS)
    const guildId = await getSessionGuildId(session)
    const query = db
      .from('member_trade_orders')
      .select(
        'id, listing_title, buyer_discord_id, buyer_username, seller_discord_id, seller_username, unique_name, enchant, quality, name_ko, quantity, unit_points, total_points, status, buyer_note, seller_delivery_note, dispute_reason, admin_note, delivered_at, completed_at, created_at',
      )
      .eq('guild_id', guildId)
      .not('dispute_reason', 'is', null)
      .order('created_at', { ascending: false })
      .limit(MEMBER_TRADE_PAGE_LIMIT)
    const { data, error } =
      scope === 'pending' ? await query.eq('status', 'disputed') : await query
    if (error) {
      if (/member_trade_orders|does not exist|schema cache/i.test(error.message)) {
        return { disputes: [] }
      }
      return { disputes: [], error: error.message }
    }

    const orderIds = (data ?? []).map((row) => row.id as string)
    const itemsByOrder = new Map<string, MemberTradeOrderItemRow[]>()
    if (orderIds.length > 0) {
      const { data: itemRows, error: itemError } = await db
        .from('member_trade_order_items')
        .select(
          'id, order_id, listing_item_id, unique_name, enchant, quality, name_ko, quantity, unit_points, total_points, sort_order',
        )
        .eq('guild_id', guildId)
        .in('order_id', orderIds)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })

      if (itemError && !/member_trade_order_items|does not exist|schema cache/i.test(itemError.message)) {
        return { disputes: [], error: itemError.message }
      }

      for (const row of itemRows ?? []) {
        const orderId = row.order_id as string
        const current = itemsByOrder.get(orderId) ?? []
        itemsByOrder.set(orderId, [...current, mapOrderItemRow(row)])
      }
    }

    return {
      disputes: (data ?? []).map((row) => ({
        id: row.id as string,
        listingTitle: (row.listing_title as string | null) ?? null,
        buyerDiscordId: row.buyer_discord_id as string,
        buyerUsername: row.buyer_username as string,
        sellerDiscordId: row.seller_discord_id as string,
        sellerUsername: row.seller_username as string,
        uniqueName: row.unique_name as string,
        enchant: row.enchant as number,
        quality: (row.quality as number | null) ?? null,
        nameKo: row.name_ko as string,
        quantity: row.quantity as number,
        unitPoints: row.unit_points as number,
        totalPoints: row.total_points as number,
        status: row.status as MemberTradeOrderStatus,
        buyerNote: (row.buyer_note as string | null) ?? null,
        sellerDeliveryNote: (row.seller_delivery_note as string | null) ?? null,
        disputeReason: (row.dispute_reason as string | null) ?? null,
        adminNote: (row.admin_note as string | null) ?? null,
        deliveredAt: (row.delivered_at as string | null) ?? null,
        completedAt: (row.completed_at as string | null) ?? null,
        createdAt: row.created_at as string,
        items: itemsByOrder.get(row.id as string) ?? [fallbackOrderItem(row)],
      })),
    }
  } catch (e) {
    return { disputes: [], error: e instanceof Error ? e.message : 'Server error' }
  }
}

export async function resolveMemberTradeDispute(
  orderId: string,
  resolution: 'release' | 'refund',
  adminNote?: string,
): Promise<{ error?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    if (resolution !== 'release' && resolution !== 'refund') {
      return { error: tErr('memberTradeResolutionInvalid') }
    }
    const session = await getSession()
    if (!session) return { error: 'Unauthorized' }
    const trimmedNote = adminNote?.normalize('NFKC').trim().replace(/\s+/g, ' ') ?? ''
    if (trimmedNote.length > MEMBER_TRADE_ADMIN_NOTE_MAX_LENGTH) {
      return { error: tErr('adminNoteTooLong', { max: MEMBER_TRADE_ADMIN_NOTE_MAX_LENGTH }) }
    }
    const note = sanitizeMemberTradeText(adminNote, MEMBER_TRADE_ADMIN_NOTE_MAX_LENGTH)
    const guildId = await getSessionGuildId(session)
    const db = await requireAnyCapability(MEMBER_TRADE_REVIEW_CAPS)
    const { error } = await db.rpc('resolve_member_trade_dispute', {
      p_order_id: orderId,
      p_guild_id: guildId,
      p_admin_id: session.discordId,
      p_resolution: resolution,
      p_admin_note: note,
    })
    if (error) return { error: mapAdminMemberTradeRpcError(error.message, tErr) }

    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/market')
    revalidatePath('/me')
    revalidatePath('/', 'layout')
    await logAdminAction({
      guildId,
      adminDiscordId: session.discordId,
      action: 'member_trade.dispute.resolve',
      targetId: orderId,
      targetKind: 'member_trade_order',
      details: { resolution, adminNote: note },
    })
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}
