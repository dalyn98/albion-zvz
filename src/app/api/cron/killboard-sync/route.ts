import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { syncKillboard } from '@/lib/killboard-sync'
import { listActiveTenants } from '@/lib/tenant'

// 킬보드 동기화 cron. GitHub Actions 가 15분 주기로 호출하면 모든 활성 테넌트에
// 대해 sync 를 실행한다. 과거엔 "이벤트 중 5분 / 평시 1시간" 분기 로직이 있었으나
// battle-tracker 와 동일한 15분 tick 으로 단순화했다 (이벤트 중 실시간성이 5→15분
// 으로 완화되지만 자동 리기어 처리 지연은 수 분 단위라 실질 영향 없음).

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminClient()
  const tenants = await listActiveTenants()
  const nowIso = new Date().toISOString()
  const results: Array<Record<string, unknown>> = []

  for (const tenant of tenants) {
    try {
      const result = await syncKillboard(db, tenant.id)
      await db
        .from('app_settings')
        .upsert(
          { guild_id: tenant.id, key: 'last_killboard_sync_at', value: nowIso, updated_at: nowIso },
          { onConflict: 'guild_id,key' },
        )
      results.push({ tenant: tenant.slug, ...result })
    } catch (e) {
      results.push({
        tenant: tenant.slug,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return NextResponse.json({ tenants: results })
}
