import {
  deploymentEnv,
  matchers,
  type VercelConfig,
} from '@vercel/config/v1'

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
      // Matching the service-role apikey prevents this from becoming a public
      // arbitrary Supabase proxy; browser clients continue to connect directly.
      source: '/api/_supabase/:path*',
      destination: `${deploymentEnv('NEXT_PUBLIC_SUPABASE_URL')}/:path*`,
      has: [
        matchers.header(
          'apikey',
          deploymentEnv('SUPABASE_SERVICE_ROLE_KEY'),
        ),
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
