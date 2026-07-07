import { NextResponse } from 'next/server'
import { getSuperAdminSession } from '@/lib/super-admin'
import { getAdminClient } from '@/lib/supabase-admin'
import { getBattleProjectionDiffReport } from '@/lib/battle-ledger-diff-db'
import { withNoStore } from '@/lib/no-store-response'
import {
  BATTLELOG_PAUSED_API_STATUS,
  areBattlelogFeaturesPaused,
  getBattlelogPausePayload,
} from '@/lib/battlelog-pause'

export const dynamic = 'force-dynamic'

function parseLimit(raw: string | null): number | null {
  if (!raw) return 50
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const limit = Number(trimmed)
  return Number.isSafeInteger(limit) && limit > 0 && limit <= 200 ? limit : null
}

export async function GET(request: Request) {
  const session = await getSuperAdminSession()
  if (!session) {
    return withNoStore(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
  }
  if (areBattlelogFeaturesPaused()) {
    return withNoStore(
      NextResponse.json(
        getBattlelogPausePayload('battle-ledger-diff-report'),
        { status: BATTLELOG_PAUSED_API_STATUS },
      ),
    )
  }

  const url = new URL(request.url)
  const sinceHoursRaw = url.searchParams.get('since_hours')
  const limitRaw = url.searchParams.get('limit')
  const sinceHours = sinceHoursRaw ? Number(sinceHoursRaw) : 168
  const limit = parseLimit(limitRaw)

  if (!Number.isFinite(sinceHours) || sinceHours <= 0 || sinceHours > 2160) {
    return withNoStore(
      NextResponse.json({ error: 'since_hours must be in (0, 2160]' }, { status: 400 }),
    )
  }
  if (limit === null) {
    return withNoStore(
      NextResponse.json({ error: 'limit must be an integer in [1, 200]' }, { status: 400 }),
    )
  }

  const recentResolvedSince = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString()
  try {
    const report = await getBattleProjectionDiffReport({
      db: getAdminClient(),
      recentResolvedSince,
      sampleLimit: limit,
    })
    return withNoStore(
      NextResponse.json({
        recent_resolved_since: recentResolvedSince,
        ...report,
      }),
    )
  } catch (error) {
    return withNoStore(
      NextResponse.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 500 },
      ),
    )
  }
}
