import { getAdminClient } from './supabase-admin'

export interface AdminBadgeCounts {
  regear: number
  exchange: number
  donation: number
}

// Lightweight pending counts shown next to the admin sidebar links.
// Service-role client is used because row-level policies on the pending
// request tables block anonymous reads — admins always have a session here
// (layout-level gate enforces this before render).
export async function getAdminBadgeCounts(): Promise<AdminBadgeCounts> {
  const db = getAdminClient()
  const [regearRes, exchangeRes, donationRes] = await Promise.all([
    db
      .from('regear_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    db
      .from('exchange_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    db
      .from('donation_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
  ])
  return {
    regear: regearRes.count ?? 0,
    exchange: exchangeRes.count ?? 0,
    donation: donationRes.count ?? 0,
  }
}
