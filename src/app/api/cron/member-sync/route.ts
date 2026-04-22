import { NextResponse } from 'next/server'
import { runMemberSync } from '@/lib/member-sync'

// 하루 1회 Discord 길드 멤버 목록을 읽어 "탈퇴한 사용자" 플래그를 갱신.
// 실제 판정/업데이트 로직은 src/lib/member-sync.ts 에 있다. 이 라우트는
// CRON_SECRET gate + 응답 직렬화만 담당.

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

  const outcome = await runMemberSync()
  if (outcome.kind === 'throttled') {
    return NextResponse.json({ skipped: 'throttled', last_sync_at: outcome.lastSyncAt })
  }
  if (outcome.kind === 'error') {
    return NextResponse.json({ error: outcome.message }, { status: 500 })
  }
  return NextResponse.json({
    scanned: outcome.result.scanned,
    discord_members: outcome.result.discordMembers,
    active_role_ids_count: outcome.result.activeRoleIdsCount,
    roles_source: outcome.result.rolesSource,
    withdrawn: outcome.result.withdrawn,
    rejoined: outcome.result.rejoined,
  })
}
