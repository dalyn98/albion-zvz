import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { processAutoRegear } from '@/lib/auto-regear'

// Auto-regear backfill. 매칭 윈도우 변경 후 과거 이벤트를 재처리할 때 사용.
// since_hours (기본 24h) 안에 auto_regear_processed_at 이 set 된 이벤트들의
// processed_at 을 NULL 로 리셋한 뒤 processAutoRegear 를 즉시 호출.
//
// RPC `create_auto_regear_request` 는 (event_id, killboard_event_id) UNIQUE
// 제약이 있어 이미 수동 청구된 데스에는 NULL 반환 (중복 안 만듦). 안전.
//
// AGENTS.md 의 force-static 금지 룰 적용.
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const guildId = await getSessionGuildId(session)

  const url = new URL(request.url)
  const eventIdParam = url.searchParams.get('event_id')
  const sinceHoursRaw = url.searchParams.get('since_hours')
  const sinceHours = sinceHoursRaw ? Number(sinceHoursRaw) : 24
  if (!Number.isFinite(sinceHours) || sinceHours <= 0 || sinceHours > 168) {
    return NextResponse.json({ error: 'since_hours must be in (0, 168]' }, { status: 400 })
  }

  const db = getAdminClient()

  let resetEventIds: string[] = []

  if (eventIdParam) {
    const { data, error } = await db
      .from('events')
      .update({ auto_regear_processed_at: null })
      .eq('guild_id', guildId)
      .eq('id', eventIdParam)
      .not('auto_regear_processed_at', 'is', null)
      .select('id')
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    resetEventIds = (data ?? []).map((r: { id: string }) => r.id)
  } else {
    const sinceIso = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString()
    const { data, error } = await db
      .from('events')
      .update({ auto_regear_processed_at: null })
      .eq('guild_id', guildId)
      .not('auto_regear_processed_at', 'is', null)
      .gte('battle_started_at', sinceIso)
      .select('id, title, battle_started_at')
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    resetEventIds = (data ?? []).map((r: { id: string }) => r.id)
  }

  // 즉시 cron 로직 실행 (다음 5분 cron 까지 안 기다리고).
  const result = await processAutoRegear(db, guildId)

  return NextResponse.json(
    {
      reset_event_count: resetEventIds.length,
      reset_event_ids: resetEventIds,
      auto_regear_result: result,
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
