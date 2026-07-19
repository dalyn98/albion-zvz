import type { VercelConfig } from '@vercel/config/v1'

export const config: VercelConfig = {
  // Supabase is hosted in ap-southeast-2. Keeping Node functions in Sydney
  // removes the trans-Pacific round trip from every PostgREST/RPC call.
  regions: ['syd1'],
  crons: [
    { path: '/api/cron/battle-tracker', schedule: '*/5 * * * *' },
    { path: '/api/cron/killboard-sync', schedule: '1-59/5 * * * *' },
    { path: '/api/cron/auto-regear', schedule: '2-59/5 * * * *' },
    { path: '/api/cron/event-imminent', schedule: '3-59/5 * * * *' },
    { path: '/api/cron/killbot-feed', schedule: '4-59/5 * * * *' },
    { path: '/api/cron/admin-notification-digest', schedule: '5-59/15 * * * *' },
    { path: '/api/cron/albion-roster-sync', schedule: '0 */6 * * *' },
    { path: '/api/cron/account-albion-sync', schedule: '30 19 * * *' },
    { path: '/api/cron/member-sync', schedule: '0 19 * * *' },
    { path: '/api/cron/search-console-sync', schedule: '20 20 * * *' },
    { path: '/api/cron/cleanup-screenshots', schedule: '0 17 * * *' },
    { path: '/api/cron/craft-expire', schedule: '0 18 * * *' },
    { path: '/api/cron/member-trade-expire', schedule: '10 18 * * *' },
    { path: '/api/cron/shop-price-sync', schedule: '0 * * * *' },
  ],
}
