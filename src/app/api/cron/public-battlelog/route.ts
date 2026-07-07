import { NextResponse } from 'next/server'
import { withCronRun } from '@/lib/cron-run'
import { parseBoundedInt } from '@/lib/parse-bounded-int'
import { syncPublicBattlelog } from '@/lib/public-battlelog-sync'
import {
  BATTLELOG_PAUSED_CRON_STATUS,
  areBattlelogFeaturesPaused,
  getBattlelogPausePayload,
} from '@/lib/battlelog-pause'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  return withCronRun(
    request,
    { jobName: 'public-battlelog', leaseSeconds: 900 },
    async ({ db }) => {
      if (areBattlelogFeaturesPaused()) {
        return NextResponse.json(
          getBattlelogPausePayload('public-battlelog'),
          { status: BATTLELOG_PAUSED_CRON_STATUS },
        )
      }

      const url = new URL(request.url)
      const pages = parseBoundedInt(url.searchParams.get('pages'), 1, 8) ?? 3
      const result = await syncPublicBattlelog(db, { pages })
      return NextResponse.json(result)
    },
  )
}
