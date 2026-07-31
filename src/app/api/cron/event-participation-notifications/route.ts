import { NextResponse } from 'next/server'
import { withCronRun } from '@/lib/cron-run'
import { processEventParticipationNotificationOutbox } from '@/lib/event-participation-closeout-server'
import { processDomainOutbox } from '@/lib/domain-outbox-delivery'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronRun(
    request,
    {
      jobName: 'event-participation-notifications',
      leaseSeconds: 300,
    },
    async () => {
      try {
        const [participation, domain] = await Promise.all([
          processEventParticipationNotificationOutbox({ limit: 100 }),
          processDomainOutbox({ limit: 100 }),
        ])
        return NextResponse.json({ participation, domain })
      } catch (error) {
        return NextResponse.json(
          {
            error: error instanceof Error ? error.message : 'unknown',
          },
          { status: 500 },
        )
      }
    },
  )
}
