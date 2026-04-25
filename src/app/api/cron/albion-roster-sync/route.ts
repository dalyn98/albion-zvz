import { NextResponse } from 'next/server'
import { runAlbionRosterSync } from '@/lib/albion-roster-sync'
import { listActiveTenants } from '@/lib/tenant'

// Albion 길드 멤버 로스터를 6시간 주기로 sync. 호출 규약 + 격리는 member-sync
// 와 동일 — Bearer CRON_SECRET, per-tenant try/catch.
//
// 6시간 주기 이유: 길드 가입/탈퇴는 비교적 드물고 /guilds/{id}/members 응답
// 크기가 ~580KB 라 자주 호출할 이유 없음. 데이터 신선도와 부하의 균형점.

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

  const tenants = await listActiveTenants()
  const results: Array<Record<string, unknown>> = []
  for (const tenant of tenants) {
    try {
      const outcome = await runAlbionRosterSync(tenant.id)
      if (outcome.kind === 'skipped') {
        results.push({ tenant: tenant.slug, skipped: outcome.reason })
      } else if (outcome.kind === 'error') {
        results.push({ tenant: tenant.slug, error: outcome.message })
      } else {
        results.push({ tenant: tenant.slug, ...outcome.result })
      }
    } catch (e) {
      results.push({
        tenant: tenant.slug,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return NextResponse.json({ tenants: results })
}
