import { NextResponse } from 'next/server'
import { syncSearchConsolePerformance } from '@/lib/seo-search-console-sync'
import { withCronRun } from '@/lib/cron-run'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  return withCronRun(
    request,
    { jobName: 'search-console-sync', leaseSeconds: 900 },
    async ({ db, runId }) =>
      NextResponse.json(await syncSearchConsolePerformance(db, { runId })),
  )
}
