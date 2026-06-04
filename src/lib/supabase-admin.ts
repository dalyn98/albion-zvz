import 'server-only'
import { createClient } from '@supabase/supabase-js'

// Service-role client — server-side only. Never import in client components.
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin env vars not set')
  return createClient(url, key, { auth: { persistSession: false } })
}
