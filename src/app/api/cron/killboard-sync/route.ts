import { NextResponse } from 'next/server'
import { syncKillboard } from '@/lib/killboard-sync'
import { listActiveTenants } from '@/lib/tenant'
import { withCronRun } from '@/lib/cron-run'
import {
  IDLE_KILLBOARD_SYNC_INTERVAL_MS,
  loadEventActivityByTenant,
  loadTenantCronSettings,
  shouldRunIdleCron,
} from '@/lib/cron-cost-control'

// 킬보드 동기화 cron. Vercel Pro native cron (vercel.json) 으로 5분 주기 호출 →
// 모든 활성 테넌트에 대해 sync 를 실행한다. battle-tracker 와 동일한 tick 으로
// 묶어서 자동 리기어 처리 지연을 최소화.

export const dynamic = 'force-dynamic'
// Vercel 의 함수 timeout 기본 300s 활용. 가입자(~200명) + 미연동 30명 sample 폴링이면
// 약 2분 내외에 끝나지만, 길드 규모가 큰 tenant 가 여럿일 때를 대비해 여유.
export const maxDuration = 300

// 동시에 sync 하는 tenant 수. Albion API 는 IP 당 rate-limit 이 있고 syncKillboard
// 내부에서 호출 사이 250ms sleep 이 들어가므로 IP=1 에서 2~3 동시 처리가 안전한
// 상한. 4 이상으로 올리면 429 위험 — 보수적으로 3 으로 고정.
const TENANT_CONCURRENCY = 3
// 새 tenant 를 시작하지 않을 시각 (cron 시작 후 N 초). 진행 중 sync 는 끝까지
// 두지만 batch 다음 tick 으로 넘긴다. maxDuration(300s) 보다 충분히 작게.
const DEADLINE_MS = 240_000
// 한 tenant 가 절대 넘기지 못하는 sync 시간. 정상치: 60명 Discord 가입자 +
// 30명 미연동 = 90 × 2(kills+deaths) × ~300ms ≈ 54s. 90s 면 충분한 헤드룸이며,
// 한 tenant 의 외부 API 스톨이 같은 chunk 의 다른 tenant 결과를 막지 못하게 함.
// timeout 시 AbortSignal 로 Albion fetch/sleep 도 끊어 다음 tick 부하를 줄인다.
const PER_TENANT_TIMEOUT_MS = 90_000

function tenantTimeoutSignal(tenantSlug: string): {
  signal: AbortSignal
  cancel: () => void
  timeout: Promise<never>
} {
  const controller = new AbortController()
  const error = new Error(`per-tenant timeout (${PER_TENANT_TIMEOUT_MS}ms): ${tenantSlug}`)
  const timer = setTimeout(() => controller.abort(error), PER_TENANT_TIMEOUT_MS)
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timer),
    timeout: new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(error), { once: true })
    }),
  }
}

export async function GET(request: Request) {
  return withCronRun(request, { jobName: 'killboard-sync', leaseSeconds: 600 }, async ({ db }) => {
    const url = new URL(request.url)
    const force = url.searchParams.get('force') === '1' || url.searchParams.get('force') === 'true'
    const tenants = await listActiveTenants()
    const nowIso = new Date().toISOString()
    const startedAt = Date.now()
    const tenantIds = tenants.map((tenant) => tenant.id)
    const [settingsByTenant, activeTenantIds] = await Promise.all([
      loadTenantCronSettings(db, tenantIds, ['last_killboard_sync_at']),
      loadEventActivityByTenant(db, tenantIds, startedAt),
    ])
    const results: Array<Record<string, unknown>> = []
    const skipped: Array<{
      tenant: string
      reason: string
      last_run_at?: string | null
      age_ms?: number | null
    }> = []

    async function processTenant(tenant: { id: string; slug: string }): Promise<void> {
      const lastRunAt = settingsByTenant.get(tenant.id)?.get('last_killboard_sync_at') ?? null
      const decision = shouldRunIdleCron({
        force,
        hasActivity: activeTenantIds.has(tenant.id),
        lastRunAt,
        nowMs: startedAt,
        idleIntervalMs: IDLE_KILLBOARD_SYNC_INTERVAL_MS,
      })
      if (!decision.run) {
        skipped.push({
          tenant: tenant.slug,
          reason: decision.reason,
          last_run_at: lastRunAt,
          age_ms: decision.ageMs,
        })
        return
      }

      const timeout = tenantTimeoutSignal(tenant.slug)
      try {
        const result = await Promise.race([
          syncKillboard(db, tenant.id, { signal: timeout.signal }),
          timeout.timeout,
        ])
        const finishIso = new Date().toISOString()
        await db
          .from('app_settings')
          .upsert(
            { guild_id: tenant.id, key: 'last_killboard_sync_at', value: finishIso, updated_at: finishIso },
            { onConflict: 'guild_id,key' },
          )
        results.push({ tenant: tenant.slug, ...result })
      } catch (e) {
        results.push({
          tenant: tenant.slug,
          error: e instanceof Error ? e.message : String(e),
        })
      } finally {
        timeout.cancel()
      }
    }

    // 단순 chunk 병렬 — Promise.all 묶음 단위로 진행, 묶음 사이 deadline 체크.
    for (let i = 0; i < tenants.length; i += TENANT_CONCURRENCY) {
      if (Date.now() - startedAt > DEADLINE_MS) {
        for (const t of tenants.slice(i)) {
          skipped.push({ tenant: t.slug, reason: 'deadline-reached' })
        }
        break
      }
      const chunk = tenants.slice(i, i + TENANT_CONCURRENCY)
      await Promise.all(chunk.map(processTenant))
    }

    return NextResponse.json({
      tenants: results,
      skipped,
      force,
      idle_interval_minutes: IDLE_KILLBOARD_SYNC_INTERVAL_MS / 60_000,
      active_tenants: activeTenantIds.size,
      started_at: nowIso,
    })
  })
}
