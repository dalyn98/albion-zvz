import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { processAutoRegear } from '@/lib/auto-regear'
import { revalidatePath } from 'next/cache'

// 자동 리기어 cron. GitHub Actions 가 5분 주기로 호출. 내부에서 전역 toggle
// (auto_regear_enabled) 과 이벤트 단위 processed gate 로 중복 처리를 방지한다.
// killboard-sync 와는 다른 GATE 전략: 여기서는 idle cooldown 을 쓰지 않는다
// — 이벤트 종료 직후 1회만 일해야 해서 평시 호출은 어차피 no-op 이다.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
  const result = await processAutoRegear(db)

  const nowIso = new Date().toISOString()
  await db
    .from('app_settings')
    .upsert(
      { key: 'last_auto_regear_at', value: nowIso, updated_at: nowIso },
      { onConflict: 'key' },
    )

  // 자동 행이 생겼으면 대시보드의 regear 관련 화면이 즉시 반영되게 한다.
  if (result.requests_created > 0) {
    revalidatePath('/admin/dashboard/regear')
    revalidatePath('/admin/dashboard/approvals')
    revalidatePath('/me')
  }

  return NextResponse.json(result)
}
