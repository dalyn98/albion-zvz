import { cache } from 'react'
import { loadAdminWorkQueueSnapshot } from './admin-work-queue-server'

export interface AdminBadgeCounts {
  regear: number
  exchange: number
  donation: number
  shop: number
  memberTrade: number
  eventPayout: number
  craft: number
}

// Compatibility shape for existing sidebar and approval components. Counts
// come from the same normalized snapshot used by the operator dashboard and
// Discord digest; there is intentionally no per-table fallback.
export const getAdminBadgeCounts = cache(async (guildId: string): Promise<AdminBadgeCounts> => {
  const { counts } = await loadAdminWorkQueueSnapshot(guildId)
  return {
    regear: counts.regear,
    exchange: counts.exchange,
    donation: counts.donation,
    shop: counts.shop,
    memberTrade: counts.memberTrade,
    eventPayout: counts.eventPayout,
    craft: counts.craft,
  }
})
