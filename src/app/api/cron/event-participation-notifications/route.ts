import { NextResponse } from 'next/server'
import { withCronRun } from '@/lib/cron-run'
import {
  processEventParticipationAutoCloseout,
  processEventParticipationAutoCloseoutNotices,
  processEventParticipationNotificationOutbox,
} from '@/lib/event-participation-closeout-server'
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
        const notices =
          await processEventParticipationAutoCloseoutNotices({ limit: 100 })
        const autoCloseout =
          await processEventParticipationAutoCloseout({ limit: 100 })
        const [participation, domain] = await Promise.all([
          processEventParticipationNotificationOutbox({ limit: 100 }),
          processDomainOutbox({ limit: 100 }),
        ])
        return NextResponse.json({ notices, autoCloseout, participation, domain })
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
