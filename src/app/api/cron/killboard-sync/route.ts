import { NextResponse } from 'next/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getAppSetting } from '@/lib/app-settings'
import { syncKillboard } from '@/lib/killboard-sync'
import { listActiveTenants } from '@/lib/tenant'

// 킬보드 동기화 cron. GitHub Actions 가 5분 주기로 호출하면, 이 엔드포인트가
// 내부적으로 "지금 sync 를 돌릴지" 를 판단한다 — 이벤트 진행 중이면 5분 간격,
// 평시면 1시간 간격. Phase 3: 테넌트 단위로 게이트 + 실행.

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// 평시 최소 간격 (초). 이벤트 진행 중엔 이 게이트를 무시.
const IDLE_MIN_INTERVAL_SEC = 60 * 60
// 킬보드 이벤트가 5분 내에 모이는 동안 발생한 사망을 놓치지 않으려는 여유.
const ACTIVE_WINDOW_BUFFER_SEC = 15 * 60

async function hasActiveEvent(
  db: ReturnType<typeof getAdminClient>,
  tenantId: string,
  regearWindowMinutes: number,
): Promise<boolean> {
  const windowStart = new Date(
    Date.now() - (regearWindowMinutes * 60 + ACTIVE_WINDOW_BUFFER_SEC) * 1000,
  ).toISOString()
  const { count } = await db
    .from('events')
    .select('id', { head: true, count: 'exact' })
    .eq('guild_id', tenantId)
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
  const tenants = await listActiveTenants()
  const nowIso = new Date().toISOString()
  const results: Array<Record<string, unknown>> = []

  for (const tenant of tenants) {
    try {
      const regearWindowMinutesRaw = await getAppSetting('regear_window_minutes', '60', tenant.id)
      const regearWindowMinutes = Number(regearWindowMinutesRaw) || 60

      const active = await hasActiveEvent(db, tenant.id, regearWindowMinutes)
      const lastSyncIso = await getAppSetting('last_killboard_sync_at', '', tenant.id)
      const lastSyncMs = lastSyncIso ? Date.parse(lastSyncIso) : 0

      if (!active && Number.isFinite(lastSyncMs) && lastSyncMs > 0) {
        const sinceSec = (Date.now() - lastSyncMs) / 1000
        if (sinceSec < IDLE_MIN_INTERVAL_SEC) {
          results.push({
            tenant: tenant.slug,
            skipped: 'idle-cooldown',
            active,
            since_last_sec: Math.round(sinceSec),
          })
          continue
        }
      }

      const result = await syncKillboard(db, tenant.id)
      await db
        .from('app_settings')
        .upsert(
          { guild_id: tenant.id, key: 'last_killboard_sync_at', value: nowIso, updated_at: nowIso },
          { onConflict: 'guild_id,key' },
        )
      results.push({ tenant: tenant.slug, active, ...result })
    } catch (e) {
      results.push({
        tenant: tenant.slug,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  return NextResponse.json({ tenants: results })
}
