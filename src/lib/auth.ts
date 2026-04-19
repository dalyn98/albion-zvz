import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'

// Server-action gate: throws if the caller is not a verified guild admin,
// otherwise returns the service-role client. Use at the top of every admin
// server action so the auth check + client acquisition lives in one place.
export async function requireAdmin() {
  const session = await getSession()
  if (!session?.isAdmin) throw new Error('Unauthorized')
  return getAdminClient()
}
