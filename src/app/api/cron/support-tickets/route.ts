import { NextResponse } from 'next/server'
import { withCronRun } from '@/lib/cron-run'
import { processSupportTicketMaintenance } from '@/lib/discord-support-ticket-service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  return withCronRun(
    request,
    { jobName: 'support-tickets', leaseSeconds: 600 },
    async () => NextResponse.json(await processSupportTicketMaintenance()),
  )
}
