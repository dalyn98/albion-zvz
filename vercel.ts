import { matchers, type VercelConfig } from '@vercel/config/v1'

export const config: VercelConfig = {
  // Supabase is hosted in ap-southeast-2, but the syd1 -> Supabase REST path can
  // fail independently while the project remains reachable from Northeast
  // Asia. Keep compute in Seoul so the public site, Discord interactions, and
  // cron handlers share the verified healthy path. The added DB latency is a
  // deliberate availability trade-off; static assets still use Vercel's CDN.
  regions: ['icn1'],
  rewrites: [
    {
      // Vercel Functions currently time out on the direct Supabase API Gateway
      // path. Relay server-only clients through Vercel's routing proxy instead.
      // Credentials are never injected: the caller's Supabase key and bearer
      // token are forwarded as-is and Supabase still enforces their permissions.
      // Requiring both headers prevents accidental browser/navigation traffic,
      // while the fixed destination prevents arbitrary outbound proxying.
      source: '/api/_supabase/:path*',
      // This is the same public project URL shipped to browser clients. Keep it
      // literal because deploymentEnv() is only supported in routing transforms,
      // not in a high-level rewrite destination.
      destination: 'https://vyucnuraaniktvfrgqxg.supabase.co/:path*',
      has: [
        matchers.header('apikey'),
        matchers.header('authorization'),
      ],
      respectOriginCacheControl: false,
    },
  ],
  crons: [
    { path: '/api/cron/battle-tracker', schedule: '*/5 * * * *' },
    { path: '/api/cron/killboard-sync', schedule: '1-59/5 * * * *' },
    { path: '/api/cron/auto-regear', schedule: '2-59/5 * * * *' },
    { path: '/api/cron/event-imminent', schedule: '3-59/5 * * * *' },
    { path: '/api/cron/killbot-feed', schedule: '4-59/5 * * * *' },
    {
      path: '/api/cron/event-participation-notifications',
      schedule: '6-59/5 * * * *',
    },
    { path: '/api/cron/admin-notification-digest', schedule: '5-59/15 * * * *' },
    { path: '/api/cron/support-tickets', schedule: '10-59/15 * * * *' },
    { path: '/api/cron/support-ai', schedule: '7-59/5 * * * *' },
    { path: '/api/cron/albion-roster-sync', schedule: '0 */6 * * *' },
    { path: '/api/cron/account-albion-sync', schedule: '30 19 * * *' },
    { path: '/api/cron/member-sync', schedule: '0 19 * * *' },
    { path: '/api/cron/search-console-sync', schedule: '20 20 * * *' },
    { path: '/api/cron/cleanup-screenshots', schedule: '0 17 * * *' },
    { path: '/api/cron/craft-expire', schedule: '0 18 * * *' },
    { path: '/api/cron/member-trade-expire', schedule: '10 18 * * *' },
    { path: '/api/cron/tenant-lifecycle', schedule: '20 18 * * *' },
    { path: '/api/cron/shop-price-sync', schedule: '0 * * * *' },
    { path: '/api/cron/public-battlelog', schedule: '*/5 * * * *' },
    { path: '/api/cron/public-battlelog-recovery', schedule: '17 * * * *' },
  ],
}
