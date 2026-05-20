import { NextResponse } from 'next/server'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSuperAdminSession } from '@/lib/super-admin'

// 최근 auto_generated regear_requests 의 상태 분포를 read-only 로 노출.
// auto-approval 이 일어났는지 검증용. AGENTS.md force-static 금지 룰 적용.

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await getSuperAdminSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const guildId = await getSessionGuildId(session)

  const url = new URL(request.url)
  const sinceHoursRaw = url.searchParams.get('since_hours')
  const sinceHours = sinceHoursRaw ? Number(sinceHoursRaw) : 48
  if (!Number.isFinite(sinceHours) || sinceHours <= 0 || sinceHours > 720) {
    return NextResponse.json({ error: 'since_hours must be in (0, 720]' }, { status: 400 })
  }
  const sinceIso = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString()

  const db = getAdminClient()
  const { data, error } = await db
    .from('regear_requests')
    .select(
      'id, event_id, event_title_snapshot, discord_id, username, role_name, status, auto_generated, payout_silver, claimed_silver, killboard_event_id, created_at, resolved_at, handled_by_username',
    )
    .eq('guild_id', guildId)
    .eq('auto_generated', true)
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type Row = {
    status: string
    resolved_at: string | null
    handled_by_username: string | null
    payout_silver: number | null
  }
  const rows = (data ?? []) as Row[]
  const byStatus = new Map<string, number>()
  for (const r of rows) {
    byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1)
  }

  return NextResponse.json(
    {
      since: sinceIso,
      total: rows.length,
      by_status: Object.fromEntries(byStatus),
      rows: data,
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
