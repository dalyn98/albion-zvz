import { NextResponse } from 'next/server'
import { syncKillboard } from '@/lib/killboard-sync'
import { listActiveTenants } from '@/lib/tenant'
import { withCronRun } from '@/lib/cron-run'

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
// 타임아웃되더라도 in-flight 호출은 백그라운드에서 자연 종료될 때까지 계속됨 —
// AbortSignal 까지 엮으면 코드가 복잡해지므로 의도적 단순화.
const PER_TENANT_TIMEOUT_MS = 90_000

export async function GET(request: Request) {
  return withCronRun(request, { jobName: 'killboard-sync', leaseSeconds: 600 }, async ({ db }) => {
    const tenants = await listActiveTenants()
    const nowIso = new Date().toISOString()
    const startedAt = Date.now()
    const results: Array<Record<string, unknown>> = []
    const skipped: Array<{ tenant: string; reason: string }> = []

    async function processTenant(tenant: { id: string; slug: string }): Promise<void> {
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`per-tenant timeout (${PER_TENANT_TIMEOUT_MS}ms)`)),
            PER_TENANT_TIMEOUT_MS,
          ),
        )
        const result = await Promise.race([syncKillboard(db, tenant.id), timeout])
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

    return NextResponse.json({ tenants: results, skipped, started_at: nowIso })
  })
}
