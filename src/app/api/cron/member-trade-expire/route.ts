import { NextResponse } from 'next/server'
import { expireMemberTradeOrders } from '@/lib/cron-maintenance'
import { withCronRun } from '@/lib/cron-run'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronRun(
    request,
    { jobName: 'member-trade-expire', leaseSeconds: 300 },
    async ({ db }) =>
      NextResponse.json({ expired: await expireMemberTradeOrders(db) }),
  )
}
