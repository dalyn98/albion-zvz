import 'server-only'
import { createClient } from '@supabase/supabase-js'

function createAdminClient(url: string, key: string) {
  return createClient(url, key, { auth: { persistSession: false } })
}

let cachedAdminClient: ReturnType<typeof createAdminClient> | null = null
let cachedAdminEnv: { url: string; key: string } | null = null

// Service-role client — server-side only. Never import in client components.
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin env vars not set')
  if (!cachedAdminClient || cachedAdminEnv?.url !== url || cachedAdminEnv.key !== key) {
    cachedAdminClient = createAdminClient(url, key)
    cachedAdminEnv = { url, key }
  }
  return cachedAdminClient
}
