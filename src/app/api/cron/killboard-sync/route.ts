import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { syncKillboard } from '@/lib/killboard-sync'
import { listActiveTenants } from '@/lib/tenant'

// 킬보드 동기화 cron. Vercel Pro native cron (vercel.json) 으로 5분 주기 호출 →
// 모든 활성 테넌트에 대해 sync 를 실행한다. battle-tracker 와 동일한 tick 으로
// 묶어서 자동 리기어 처리 지연을 최소화.

export const dynamic = 'force-dynamic'
// Vercel 의 함수 timeout 기본 300s 활용. 가입자(~200명) + 미연동 30명 sample 폴링이면
// 약 2분 내외에 끝나지만, 길드 규모가 큰 tenant 가 여럿일 때를 대비해 여유.
export const maxDuration = 300

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
