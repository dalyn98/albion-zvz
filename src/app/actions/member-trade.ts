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
  MEMBER_TRADE_CITY_MAX_LENGTH,
  MEMBER_TRADE_DELIVERY_NOTE_MAX_LENGTH,
  MEMBER_TRADE_DISPUTE_REASON_MAX_LENGTH,
  MEMBER_TRADE_MEMO_MAX_LENGTH,
  normalizeMemberTradeQuantity,
  normalizeMemberTradeUnitPoints,
  sanitizeMemberTradeText,
  type MemberTradeListingStatus,
  type MemberTradeOrderStatus,
} from '@/lib/member-trade'
import { getMemberSpendablePointSummary } from '@/lib/point-ledger'

const MEMBER_TRADE_PAGE_LIMIT = 200
const MEMBER_TRADE_REVIEW_CAPS = [CAP.INVENTORY_DELIVER, CAP.INVENTORY_MANAGE] as const
const MEMBER_TRADE_ADMIN_NOTE_MAX_LENGTH = 1000

export interface CreateMemberTradeListingInput {
  itemQuery: string
  enchant: number
  quality?: number | null
  quantity: number
  unitPoints: number
  city?: string | null
  deliveryNote?: string | null
}

export interface MemberTradeListingRow {
  id: string
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
}

export interface MemberTradeOrderRow {
  id: string
  listingId: string
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
}

export interface MemberTradePointSummaryRow {
  balance: number
  escrowed: number
  spendable: number
}

export interface AdminMemberTradeDisputeRow {
  id: string
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
}

function mapMemberTradeRpcError(
  message: string,
  tErr: Awaited<ReturnType<typeof getTranslations<'memberActionError'>>>,
): string {
  if (message.includes('INSUFFICIENT_BALANCE')) return tErr('memberTradeInsufficientSpendable')
  if (message.includes('SELF_TRADE')) return tErr('memberTradeSelfTrade')
  if (message.includes('LISTING_NOT_FOUND')) return tErr('memberTradeListingUnavailable')
  if (message.includes('LISTING_NOT_PURCHASABLE')) return tErr('memberTradeListingUnavailable')
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
  const { data, error } = await db
    .from('member_trade_listings')
    .select(
      'id, seller_discord_id, seller_username, unique_name, enchant, quality, name_ko, category, tier, quantity_available, unit_points, status, city, delivery_note, expires_at, created_at',
    )
    .eq('guild_id', guildId)
    .eq('status', 'active')
    .gt('quantity_available', 0)
    .order('created_at', { ascending: false })
    .limit(MEMBER_TRADE_PAGE_LIMIT)
  if (error) {
    if (/member_trade_listings|does not exist|schema cache/i.test(error.message)) {
      return { listings: [] }
    }
    return { listings: [], error: error.message }
  }

  const now = new Date()
  return {
    listings: (data ?? [])
      .filter((row) =>
        isMemberTradeListingPurchasable({
          status: row.status as MemberTradeListingStatus,
          quantityAvailable: Number(row.quantity_available) || 0,
          expiresAt: (row.expires_at as string | null) ?? null,
          now,
        }),
      )
      .map((row) => ({
        id: row.id as string,
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
      })),
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
      'id, listing_id, buyer_discord_id, buyer_username, seller_discord_id, seller_username, unique_name, enchant, quality, name_ko, quantity, unit_points, total_points, status, buyer_note, seller_delivery_note, dispute_reason, admin_note, delivery_due_at, delivered_at, completed_at, created_at',
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

  return {
    orders: (data ?? []).map((row) => ({
      id: row.id as string,
      listingId: row.listing_id as string,
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

  const itemQuery = sanitizeMemberTradeText(input.itemQuery, 120)
  if (!itemQuery) return { error: tErr('memberTradeItemRequired') }
  const resolved = resolveAlbionItem(itemQuery)
  if (!resolved) return { error: tErr('memberTradeItemUnresolved') }

  const enchant = validateEnchant(Number(input.enchant))
  if (enchant === null) return { error: tErr('memberTradeInvalidEnchant') }
  const quality = validateQuality(input.quality)
  const quantity = normalizeMemberTradeQuantity(input.quantity)
  if (quantity === null) return { error: tErr('memberTradeInvalidQuantity') }
  const unitPoints = normalizeMemberTradeUnitPoints(input.unitPoints)
  if (unitPoints === null) return { error: tErr('memberTradeInvalidPrice') }
  if (unitPoints > Math.floor(2_147_483_647 / quantity)) {
    return { error: tErr('invalidAmount') }
  }
  const city = sanitizeMemberTradeText(input.city, MEMBER_TRADE_CITY_MAX_LENGTH)
  const deliveryNote = sanitizeMemberTradeText(
    input.deliveryNote,
    MEMBER_TRADE_DELIVERY_NOTE_MAX_LENGTH,
  )

  const db = getAdminClient()
  const { data, error } = await db
    .from('member_trade_listings')
    .insert({
      guild_id: required.guildId,
      seller_discord_id: required.session.discordId,
      seller_username: required.session.username,
      unique_name: resolved.uniqueName,
      enchant,
      quality,
      name_ko: resolved.nameKo,
      category: resolved.category,
      tier: resolved.tier,
      quantity_total: quantity,
      quantity_available: quantity,
      unit_points: unitPoints,
      city,
      delivery_note: deliveryNote,
      expires_at: defaultMemberTradeExpiresAt(),
    })
    .select('id')
    .single()
  if (error) return { error: error.message }

  revalidatePath('/market')
  revalidatePath('/me')
  return { id: data.id as string }
}

export async function buyMemberTradeListing(
  listingId: string,
  quantity: number,
  buyerNote?: string,
): Promise<{ id?: string; error?: string }> {
  const tErr = await getTranslations('memberActionError')
  const required = await requireMemberTradeSession()
  if (required.error || !required.session || !required.guildId) {
    return { error: required.error ?? tErr('serverError') }
  }
  const normalizedQuantity = normalizeMemberTradeQuantity(quantity)
  if (normalizedQuantity === null) return { error: tErr('memberTradeInvalidQuantity') }
  const note = sanitizeMemberTradeText(buyerNote, MEMBER_TRADE_MEMO_MAX_LENGTH)

  const db = getAdminClient()
  const { data, error } = await db.rpc('buy_member_trade_listing', {
    p_listing_id: listingId,
    p_guild_id: required.guildId,
    p_buyer_discord_id: required.session.discordId,
    p_buyer_username: required.session.username,
    p_quantity: normalizedQuantity,
    p_buyer_note: note,
  })
  if (error) return { error: mapMemberTradeRpcError(error.message, tErr) }

  revalidatePath('/market')
  revalidatePath('/me')
  revalidatePath('/', 'layout')
  return { id: typeof data === 'string' ? data : undefined }
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
        'id, buyer_discord_id, buyer_username, seller_discord_id, seller_username, unique_name, enchant, quality, name_ko, quantity, unit_points, total_points, status, buyer_note, seller_delivery_note, dispute_reason, admin_note, delivered_at, completed_at, created_at',
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

    return {
      disputes: (data ?? []).map((row) => ({
        id: row.id as string,
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
