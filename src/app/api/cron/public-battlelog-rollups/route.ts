import { NextResponse } from 'next/server'
import { withCronRun } from '@/lib/cron-run'
import { refreshPublicBattlelogRollups } from '@/lib/public-battlelog-sync'
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
    {
      jobName: 'public-battlelog-rollups',
      leaseSeconds: 360,
      lockName: 'battle-ingestion',
    },
    async ({ db }) => {
      if (!shouldCollectAgmBattles()) {
        return NextResponse.json(
          getAgmBattlesCollectionPausePayload('public-battlelog'),
          { status: AGM_BATTLES_COLLECTION_PAUSED_CRON_STATUS },
        )
      }

      return NextResponse.json(await refreshPublicBattlelogRollups(db))
    },
  )
}
