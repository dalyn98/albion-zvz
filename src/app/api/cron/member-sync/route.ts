import { NextResponse } from 'next/server'
import { runMemberSync } from '@/lib/member-sync'
import { listActiveTenants } from '@/lib/tenant'

// 하루 1회 Discord 길드 멤버 목록을 읽어 "탈퇴한 사용자" 플래그를 갱신.
// 실제 판정/업데이트 로직은 src/lib/member-sync.ts 에 있다. 이 라우트는
// CRON_SECRET gate + 응답 직렬화만 담당.
//
// Phase 3: active 테넌트 전부 순회. 실패 1건이 다른 테넌트를 막지 않도록
// 개별 try/catch 로 격리하고 결과는 per-tenant 로 반환한다.

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
    if (!tenant.botInstalled) {
      results.push({ tenant: tenant.slug, skipped: 'bot_not_installed' })
      continue
    }
    try {
      const outcome = await runMemberSync(tenant.id)
      if (outcome.kind === 'throttled') {
        results.push({ tenant: tenant.slug, skipped: 'throttled', last_sync_at: outcome.lastSyncAt })
      } else if (outcome.kind === 'error') {
        results.push({ tenant: tenant.slug, error: outcome.message })
      } else {
        results.push({
          tenant: tenant.slug,
          scanned: outcome.result.scanned,
          discord_members: outcome.result.discordMembers,
          withdrawn: outcome.result.withdrawn,
          rejoined: outcome.result.rejoined,
        })
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
