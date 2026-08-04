import { NextResponse } from 'next/server'
import { withCronRun } from '@/lib/cron-run'
import { syncPublicBattlelog } from '@/lib/public-battlelog-sync'
import {
  AGM_BATTLES_COLLECTION_PAUSED_CRON_STATUS,
  getAgmBattlesCollectionPausePayload,
  shouldCollectAgmBattles,
} from '@/lib/agm-battles-collection-pause'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: Request) {
  return withCronRun(
    request,
    { jobName: 'public-battlelog-recovery', leaseSeconds: 2700 },
    async ({ db }) => {
      if (!shouldCollectAgmBattles()) {
        return NextResponse.json(
          getAgmBattlesCollectionPausePayload('public-battlelog'),
          { status: AGM_BATTLES_COLLECTION_PAUSED_CRON_STATUS },
        )
      }

      const result = await syncPublicBattlelog(db, {
        pages: 3,
        backfillLimit: 40,
        refreshRollups: true,
      })
      return NextResponse.json(result)
    },
  )
}
