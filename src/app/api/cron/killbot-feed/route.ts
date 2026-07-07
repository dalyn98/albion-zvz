import { NextResponse } from 'next/server'
import { withCronRun } from '@/lib/cron-run'
import { runKillbotFeed } from '@/lib/killbot'
import {
  BATTLELOG_PAUSED_CRON_STATUS,
  areBattlelogFeaturesPaused,
  getBattlelogPausePayload,
} from '@/lib/battlelog-pause'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  return withCronRun(request, { jobName: 'killbot-feed', leaseSeconds: 300 }, async ({ db }) => {
    if (areBattlelogFeaturesPaused()) {
      return NextResponse.json(
        getBattlelogPausePayload('killbot-feed'),
        { status: BATTLELOG_PAUSED_CRON_STATUS },
      )
    }

    const result = await runKillbotFeed(db)
    return NextResponse.json(result)
  })
}
