import { NextResponse } from 'next/server'
import { withCronRun } from '@/lib/cron-run'
import { cleanupResolvedRegearScreenshots } from '@/lib/regear-screenshot-cleanup'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return withCronRun(
    request,
    { jobName: 'cleanup-screenshots', leaseSeconds: 300 },
    async ({ db }) =>
      NextResponse.json(await cleanupResolvedRegearScreenshots(db)),
  )
}
