import type { SessionPayload } from '@/lib/session'
import type { getAdminClient } from '@/lib/supabase-admin'
import { getMemberSpendablePointBalance } from '@/lib/point-ledger'
import { isLocalGuildAccountRestrictedFromResources } from '@/lib/local-guild-account'
import {
  buildShopOrderPriceAdjustmentMap,
  type ShopOrderPriceAdjustment,
  type ShopOrderPriceAdjustmentAuditRow,
} from './order-price-adjustment'
import type { ShopOrderPriceReview } from './order-price-review'

type ShopMemberDb = ReturnType<typeof getAdminClient>

export interface MyOrderRow {
  id: string
  totalPoints: number
  priceReviewRequired: boolean
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  memberNote: string | null
  adminNote: string | null
  pickupNote: string | null
  priceReview?: ShopOrderPriceReview | null
  priceAdjustment?: ShopOrderPriceAdjustment | null
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

export async function getShopPointBalanceForMember(
  db: ShopMemberDb,
  guildId: string,
  session: SessionPayload,
): Promise<number> {
  if (!session.isMember) return 0
  if (isLocalGuildAccountRestrictedFromResources(session)) return 0
  const { spendable, error } = await getMemberSpendablePointBalance(db, guildId, session.discordId)
  if (error) return 0
  return spendable
}

export async function listShopOrdersForMember(
  db: ShopMemberDb,
  guildId: string,
  discordId: string,
  limit = 20,
): Promise<MyOrderRow[]> {
  const { data: orders } = await db
    .from('shop_orders')
    .select('id, total_points, price_review_required, status, member_note, admin_note, pickup_note, created_at, resolved_at')
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (!orders || orders.length === 0) return []
  const ids = orders.map((o) => o.id as string)
  const { data: items } = await db
    .from('shop_order_items')
    .select('order_id, name_ko, unique_name, enchant, quality, quantity, unit_points')
    .eq('guild_id', guildId)
    .in('order_id', ids)
  const { data: auditRows } = await db
    .from('admin_audit_log')
    .select('target_id, admin_discord_id, details, created_at')
    .eq('guild_id', guildId)
    .eq('action', 'shop.order.approve')
    .eq('target_kind', 'shop_order')
    .in('target_id', ids)
    .order('created_at', { ascending: false })
  const { data: reviewRows } = await db
    .from('shop_order_price_reviews')
    .select(
      'id, order_id, requested_total_points, proposed_total_points, status, proposal_note, created_at, member_confirmed_at',
    )
    .eq('guild_id', guildId)
    .in('order_id', ids)
    .in('status', ['awaiting_member', 'member_confirmed'])
    .order('created_at', { ascending: false })
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
  const priceAdjustmentByOrder = buildShopOrderPriceAdjustmentMap(
    (auditRows ?? []) as ShopOrderPriceAdjustmentAuditRow[],
  )
  const priceReviewByOrder = new Map<string, ShopOrderPriceReview>()
  for (const review of reviewRows ?? []) {
    const orderId = review.order_id as string
    if (priceReviewByOrder.has(orderId)) continue
    priceReviewByOrder.set(orderId, {
      id: review.id as string,
      requestedTotalPoints: review.requested_total_points as number,
      proposedTotalPoints: review.proposed_total_points as number,
      status: review.status as ShopOrderPriceReview['status'],
      proposalNote: (review.proposal_note as string | null) ?? null,
      createdAt: review.created_at as string,
      memberConfirmedAt: (review.member_confirmed_at as string | null) ?? null,
    })
  }
  return orders.map((o) => {
    const priceAdjustment = priceAdjustmentByOrder.get(o.id as string) ?? null
    return {
      id: o.id as string,
      totalPoints: o.total_points as number,
      priceReviewRequired: Boolean(o.price_review_required),
      status: o.status as MyOrderRow['status'],
      memberNote: (o.member_note as string | null) ?? null,
      adminNote: (o.admin_note as string | null) ?? null,
      pickupNote: (o.pickup_note as string | null) ?? null,
      priceReview: priceReviewByOrder.get(o.id as string) ?? null,
      priceAdjustment: priceAdjustment ? { ...priceAdjustment, adminDiscordId: null } : null,
      createdAt: o.created_at as string,
      resolvedAt: (o.resolved_at as string | null) ?? null,
      items: itemsByOrder.get(o.id as string) ?? [],
    }
  })
}
