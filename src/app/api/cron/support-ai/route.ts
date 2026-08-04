import { NextResponse } from 'next/server'
import { withCronRun } from '@/lib/cron-run'
import { processSupportTicketAiJobs } from '@/lib/support-ticket-ai-service'
import { deliverSupportAiReviewNotifications } from '@/lib/support-ticket-ai-notifications'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request: Request) {
  return withCronRun(
    request,
    { jobName: 'support-ai', leaseSeconds: 600 },
    async () => {
      const analysis = await processSupportTicketAiJobs(10)
      const notifications = await deliverSupportAiReviewNotifications(10)
      return NextResponse.json({ analysis, notifications })
    },
  )
}
