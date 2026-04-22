import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { aggregatePendingBattles } from '@/lib/battle-aggregate'

// 윈도우가 종료된 배틀을 찾아 킬 스냅샷으로 집계. GitHub Actions 에서 10분
// 주기로 호출 — killboard-sync 가 스냅샷을 쌓는 동안은 window_end 가 아직 안
// 되므로 pending 상태에 머물고, 종료된 이벤트만 여기서 판정된다.
//
// 재시도 설계: 개별 배틀 집계 실패는 `outcome='error'` 로 표시하고 나머지를
// 계속 처리 — 전체 cron 실패로 인해 다른 이벤트가 영원히 pending 에 머무는
// 케이스를 방지.

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
  const result = await aggregatePendingBattles(db)
  return NextResponse.json(result)
}
