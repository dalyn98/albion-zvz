import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { syncKillboard } from '@/lib/killboard-sync'
import { getPrimaryTenantId } from '@/lib/tenant'

// 킬보드 동기화 cron. GitHub Actions 가 5분 주기로 호출하면, 이 엔드포인트가
// 내부적으로 "지금 sync 를 돌릴지" 를 판단한다 — 이벤트 진행 중이면 5분 간격,
// 평시면 1시간 간격.
//
// 활성 이벤트 판정: battle_started_at 이 NULL 이 아니고 (지금 - regear_window_minutes)
// 이후에 시작된 이벤트가 존재.
//
// 상태 저장: 마지막 성공 시각을 app_settings.last_killboard_sync_at 에 기록
// (getAppSetting fallback 덕분에 키가 없어도 첫 실행은 통과).

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// 평시 최소 간격 (초). 이벤트 진행 중엔 이 게이트를 무시.
const IDLE_MIN_INTERVAL_SEC = 60 * 60
// 킬보드 이벤트가 5분 내에 모이는 동안 발생한 사망을 놓치지 않으려는 여유.
const ACTIVE_WINDOW_BUFFER_SEC = 15 * 60

async function hasActiveEvent(
  db: ReturnType<typeof getAdminClient>,
  regearWindowMinutes: number,
): Promise<boolean> {
  const windowStart = new Date(
    Date.now() - (regearWindowMinutes * 60 + ACTIVE_WINDOW_BUFFER_SEC) * 1000,
  ).toISOString()
  const { count } = await db
    .from('events')
    .select('id', { head: true, count: 'exact' })
    .gte('battle_started_at', windowStart)
    .lte('battle_started_at', new Date().toISOString())
  return (count ?? 0) > 0
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

  const regearWindowMinutesRaw = await getAppSetting('regear_window_minutes', '60')
  const regearWindowMinutes = Number(regearWindowMinutesRaw) || 60

  const active = await hasActiveEvent(db, regearWindowMinutes)
  const lastSyncIso = await getAppSetting('last_killboard_sync_at', '')
  const lastSyncMs = lastSyncIso ? Date.parse(lastSyncIso) : 0

  if (!active && Number.isFinite(lastSyncMs) && lastSyncMs > 0) {
    const sinceSec = (Date.now() - lastSyncMs) / 1000
    if (sinceSec < IDLE_MIN_INTERVAL_SEC) {
      return NextResponse.json({
        skipped: 'idle-cooldown',
        active,
        since_last_sec: Math.round(sinceSec),
        min_interval_sec: IDLE_MIN_INTERVAL_SEC,
      })
    }
  }

  const tenantId = await getPrimaryTenantId()
  const result = await syncKillboard(db, tenantId)

  const nowIso = new Date().toISOString()
  await db
    .from('app_settings')
    .upsert(
      { guild_id: tenantId, key: 'last_killboard_sync_at', value: nowIso, updated_at: nowIso },
      { onConflict: 'guild_id,key' },
    )

  return NextResponse.json({ active, ...result })
}
