import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { listGuildMembersBulk } from '@/lib/discord'

// 하루 1회 Discord 길드 멤버 목록을 읽어 "탈퇴한 사용자" 플래그를 갱신.
//
// 탈퇴 판정 규칙:
//   1) 길드원이 Discord 서버에 더 이상 없음 → 탈퇴
//   2) 활동 역할(active_member_role_ids) 이 설정되어 있고 그중 하나도 보유 안함
//      → 탈퇴
//   3) 위 둘 다 아니면 활동 회원 — withdrawn_at 이 걸려 있었다면 NULL 로 복구
//
// 멱등성: 같은 날 재실행되면 결과는 동일. Throttle gate (last_member_sync_at)
// 는 GitHub Actions 중복 트리거/수동 실행을 하루 1회로 수렴시킨다.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// 직전 성공 후 20시간 내면 skip — GitHub Actions retry 가 들어와도 하루 1회로
// 수렴. 20h 여유를 둬 KST 04:00 스케줄이 약간 앞당겨져도 다음날 실행이 건너뛰지
// 않는다.
const MIN_INTERVAL_MS = 20 * 60 * 60 * 1000

function parseRoleIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string' && v.length > 0)
  } catch {
    return []
  }
}

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
  const nowIso = new Date().toISOString()

  const lastAt = await getAppSetting('last_member_sync_at', '')
  if (lastAt) {
    const lastMs = Date.parse(lastAt)
    if (Number.isFinite(lastMs) && Date.now() - lastMs < MIN_INTERVAL_MS) {
      return NextResponse.json({ skipped: 'throttled', last_sync_at: lastAt })
    }
  }

  const activeRoleIdsRaw = await getAppSetting('active_member_role_ids', '[]')
  const activeRoleIds = parseRoleIds(activeRoleIdsRaw)

  const { data: avatars, error: avatarsError } = await db
    .from('guild_avatars')
    .select('discord_id, withdrawn_at')
  if (avatarsError) {
    return NextResponse.json({ error: avatarsError.message }, { status: 500 })
  }

  let members: Awaited<ReturnType<typeof listGuildMembersBulk>>
  try {
    members = await listGuildMembersBulk()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[cron/member-sync] bulk fetch failed:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const memberRoles = new Map<string, string[]>()
  for (const m of members) {
    if (!m.user) continue
    memberRoles.set(m.user.id, m.roles)
  }

  const toWithdraw: string[] = []
  const toRejoin: string[] = []
  for (const row of avatars ?? []) {
    const roles = memberRoles.get(row.discord_id)
    const inServer = !!roles
    const hasActiveRole =
      activeRoleIds.length === 0 ? true : activeRoleIds.some((id) => roles?.includes(id) ?? false)
    const isActive = inServer && hasActiveRole
    const wasActive = row.withdrawn_at === null

    if (isActive && !wasActive) toRejoin.push(row.discord_id)
    else if (!isActive && wasActive) toWithdraw.push(row.discord_id)
  }

  // batch 업데이트 — 행이 많진 않지만 IN 조건으로 단일 쿼리.
  if (toWithdraw.length > 0) {
    const { error: updErr } = await db
      .from('guild_avatars')
      .update({ withdrawn_at: nowIso })
      .in('discord_id', toWithdraw)
    if (updErr) console.error('[cron/member-sync] withdraw update failed:', updErr.message)
  }
  if (toRejoin.length > 0) {
    const { error: updErr } = await db
      .from('guild_avatars')
      .update({ withdrawn_at: null })
      .in('discord_id', toRejoin)
    if (updErr) console.error('[cron/member-sync] rejoin update failed:', updErr.message)
  }

  await db
    .from('app_settings')
    .upsert(
      { key: 'last_member_sync_at', value: nowIso, updated_at: nowIso },
      { onConflict: 'key' },
    )

  if (toWithdraw.length > 0 || toRejoin.length > 0) {
    revalidatePath('/members')
    revalidatePath('/admin/dashboard/stats')
    revalidatePath('/admin/dashboard/settings')
  }

  return NextResponse.json({
    scanned: avatars?.length ?? 0,
    discord_members: memberRoles.size,
    active_role_ids_count: activeRoleIds.length,
    withdrawn: toWithdraw.length,
    rejoined: toRejoin.length,
  })
}
