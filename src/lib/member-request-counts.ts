import type { getAdminClient } from '@/lib/supabase-admin'

type MemberRequestDb = ReturnType<typeof getAdminClient>

export interface MemberRequestCounts {
  total: number
  active: number
  error?: string
}

function countResult(
  total: { count: number | null; error: { message: string } | null },
  active: { count: number | null; error: { message: string } | null },
): MemberRequestCounts {
  const error = total.error?.message ?? active.error?.message
  return {
    total: total.count ?? 0,
    active: active.count ?? 0,
    ...(error ? { error } : {}),
  }
}

export async function countShopOrdersForMember(
  db: MemberRequestDb,
  guildId: string,
  discordId: string,
): Promise<MemberRequestCounts> {
  const scope = () => db
    .from('shop_orders')
    .select('id', { count: 'exact', head: true })
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
  const [total, active] = await Promise.all([
    scope(),
    scope().eq('status', 'pending'),
  ])
  return countResult(total, active)
}

export async function countMemberTradeOrdersForMember(
  db: MemberRequestDb,
  guildId: string,
  discordId: string,
): Promise<MemberRequestCounts> {
  const memberFilter =
    `buyer_discord_id.eq.${discordId},seller_discord_id.eq.${discordId}`
  const scope = () => db
    .from('member_trade_orders')
    .select('id', { count: 'exact', head: true })
    .eq('guild_id', guildId)
    .or(memberFilter)
  const [total, active] = await Promise.all([
    scope(),
    scope().in('status', ['awaiting_delivery', 'delivered', 'disputed']),
  ])
  return countResult(total, active)
}
