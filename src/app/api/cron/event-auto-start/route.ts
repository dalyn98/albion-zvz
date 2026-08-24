import { NextResponse } from 'next/server'
import { withCronRun } from '@/lib/cron-run'
import { startDuePublishedEvents } from '@/lib/event-auto-start'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  return withCronRun(
    request,
    { jobName: 'event-auto-start', leaseSeconds: 180 },
    async ({ db }) => {
      const result = await startDuePublishedEvents({ db })
      const ok = result.failures.length === 0
      return NextResponse.json(
        {
          ok,
          scanned: result.scanned,
          started: result.started,
          failures: result.failures,
        },
        { status: ok ? 200 : 500 },
      )
    },
  )
}
