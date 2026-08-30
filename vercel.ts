import type { VercelConfig } from '@vercel/config/v1'

export const config: VercelConfig = {
  // Supabase is hosted in ap-southeast-2, but the syd1 -> Supabase REST path can
  // fail independently while the project remains reachable from Northeast
  // Asia. Keep compute in Seoul so the public site, Discord interactions, and
  // cron handlers share the verified healthy path. The added DB latency is a
  // deliberate availability trade-off; static assets still use Vercel's CDN.
  regions: ['icn1'],
}
