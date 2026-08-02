import 'server-only'

import type { getAdminClient } from './supabase-admin'
import { resolveStableMemberOwnership } from './stable-member-ownership'

const MEMBER_PENDING_COUNTS_RPC = 'member_pending_request_counts'

export interface MemberPendingRequestCounts {
  regear: number
  exchange: number
  donation: number
}

type AdminDbClient = ReturnType<typeof getAdminClient>

export async function getMemberPendingRequestCounts(
  db: AdminDbClient,
  guildId: string,
  discordId: string,
): Promise<MemberPendingRequestCounts> {
  const { data, error } = await db.rpc(MEMBER_PENDING_COUNTS_RPC, {
    p_guild_id: guildId,
    p_discord_id: discordId,
  })

  if (!error) {
    return normalizeMemberPendingRequestCounts(data)
  }

  return getMemberPendingRequestCountsFallback(db, guildId, discordId)
}

function normalizeMemberPendingRequestCounts(data: unknown): MemberPendingRequestCounts {
  const row = Array.isArray(data) && data[0] && typeof data[0] === 'object'
    ? data[0] as Record<string, unknown>
    : {}

  return {
    regear: toCount(row.regear),
    exchange: toCount(row.exchange),
    donation: toCount(row.donation),
  }
}

async function getMemberPendingRequestCountsFallback(
  db: AdminDbClient,
  guildId: string,
  discordId: string,
): Promise<MemberPendingRequestCounts> {
  const ownership = await resolveStableMemberOwnership(db, guildId, discordId)
  const ownerColumn = ownership.guildMemberId ? 'guild_member_id' : 'discord_id'
  const ownerValue = ownership.guildMemberId ?? discordId
  const [regearRes, exchangeRes, donationRes] = await Promise.all([
    db
      .from('regear_requests')
      .select('id', { head: true, count: 'exact' })
      .eq('guild_id', guildId)
      .eq(ownerColumn, ownerValue)
      .eq('status', 'pending'),
    db
      .from('exchange_requests')
      .select('id', { head: true, count: 'exact' })
      .eq('guild_id', guildId)
      .eq(ownerColumn, ownerValue)
      .eq('status', 'pending'),
    db
      .from('donation_requests')
      .select('id', { head: true, count: 'exact' })
      .eq('guild_id', guildId)
      .eq(ownerColumn, ownerValue)
      .eq('status', 'pending'),
  ])

  return {
    regear: regearRes.count ?? 0,
    exchange: exchangeRes.count ?? 0,
    donation: donationRes.count ?? 0,
  }
}

function toCount(value: unknown): number {
  const count = Number(value ?? 0)
  return Number.isFinite(count) ? count : 0
}
