import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { processAutoRegear } from '@/lib/auto-regear'
import { revalidatePath } from 'next/cache'
import { listActiveTenants } from '@/lib/tenant'
import { log } from '@/lib/log'

// 자동 리기어 cron. GitHub Actions 가 5분 주기로 호출. 내부에서 전역 toggle
// (auto_regear_enabled) 과 이벤트 단위 processed gate 로 중복 처리를 방지한다.
// killboard-sync 와는 다른 GATE 전략: 여기서는 idle cooldown 을 쓰지 않는다
// — 이벤트 종료 직후 1회만 일해야 해서 평시 호출은 어차피 no-op 이다.
//
// Phase 3: active 테넌트 전부 순회. 테넌트 단위 try/catch 로 격리.

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
  let anyCreated = false

  for (const tenant of tenants) {
    try {
      const result = await processAutoRegear(db, tenant.id)
      await db
        .from('app_settings')
        .upsert(
          { guild_id: tenant.id, key: 'last_auto_regear_at', value: nowIso, updated_at: nowIso },
          { onConflict: 'guild_id,key' },
        )
      if (result.requests_created > 0) anyCreated = true
      results.push({ tenant: tenant.slug, ...result })
    } catch (e) {
      results.push({
        tenant: tenant.slug,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  if (anyCreated) {
    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/admin/dashboard/approvals')
  }

  log.info('[cron/auto-regear] complete', { tenants: results })
  return NextResponse.json({ tenants: results })
}
