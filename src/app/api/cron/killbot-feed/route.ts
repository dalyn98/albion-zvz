import { NextResponse } from 'next/server'
import { withCronRun } from '@/lib/cron-run'
import { runKillbotFeed } from '@/lib/killbot'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  return withCronRun(request, { jobName: 'killbot-feed', leaseSeconds: 300 }, async ({ db }) => {
    const result = await runKillbotFeed(db)
    return NextResponse.json(result)
  })
}
