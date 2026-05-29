import { NextResponse } from 'next/server'
import { runAccountAlbionSync } from '@/lib/account-albion-sync'
import { listActiveTenants } from '@/lib/tenant'
import { withCronRun } from '@/lib/cron-run'

// Discord 계정 ↔ Albion 캐릭터 매핑을 하루 1회 최신화한다.
// 멤버의 길드/연합 상태가 바뀌면 재화 기능 신뢰 상태를 자동으로 낮추고,
// 관리자는 통계의 검토 목록에서 확인/승인한다.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: Request) {
  return withCronRun(request, { jobName: 'account-albion-sync', leaseSeconds: 300 }, async () => {
    const tenants = await listActiveTenants()
    const results: Array<Record<string, unknown>> = []
    for (const tenant of tenants) {
      try {
        const outcome = await runAccountAlbionSync(tenant.id)
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
  })
}
