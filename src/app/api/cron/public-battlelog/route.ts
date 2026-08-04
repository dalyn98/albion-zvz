import { NextResponse } from 'next/server'
import { withCronRun } from '@/lib/cron-run'
import { parseBoundedInt } from '@/lib/parse-bounded-int'
import { syncPublicBattlelog } from '@/lib/public-battlelog-sync'
import { listActiveTenants } from '@/lib/tenant'
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
    { jobName: 'public-battlelog', leaseSeconds: 900 },
    async ({ db }) => {
      const activeTenants = await listActiveTenants()
      if (!shouldCollectAgmBattles(activeTenants.length)) {
        return NextResponse.json(
          getAgmBattlesCollectionPausePayload('public-battlelog'),
          { status: AGM_BATTLES_COLLECTION_PAUSED_CRON_STATUS },
        )
      }

      const url = new URL(request.url)
      const pages = parseBoundedInt(url.searchParams.get('pages'), 1, 8) ?? 3
      const backfillLimit = parseBoundedInt(
        url.searchParams.get('backfill'),
        1,
        100,
      )
      const backfillOnly = url.searchParams.get('backfillOnly') === '1'
      const options: Parameters<typeof syncPublicBattlelog>[1] = { pages }
      if (backfillLimit !== null) options.backfillLimit = backfillLimit
      if (backfillOnly) options.backfillOnly = true
      const result = await syncPublicBattlelog(db, options)
      return NextResponse.json(result)
    },
  )
}
