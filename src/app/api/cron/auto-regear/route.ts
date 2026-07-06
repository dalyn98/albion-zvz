import { NextResponse } from 'next/server'
import { processAutoRegear } from '@/lib/auto-regear'
import { revalidatePath } from 'next/cache'
import { listActiveTenants } from '@/lib/tenant'
import { log } from '@/lib/log'
import { withCronRun } from '@/lib/cron-run'

// 자동 리기어 cron. GitHub Actions 가 5분 주기로 호출. 내부에서 전역 toggle
// (auto_regear_enabled) 과 이벤트 단위 processed gate 로 중복 처리를 방지한다.
// killboard-sync 와는 다른 GATE 전략: 여기서는 idle cooldown 을 쓰지 않는다
// — 이벤트 종료 직후 1회만 일해야 해서 평시 호출은 어차피 no-op 이다.
//
// Phase 3: active 테넌트 전부 순회. 테넌트 단위 try/catch 로 격리.

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const SUMMARY_FIELDS = [
  'events_considered',
  'events_processed',
  'requests_created',
  'requests_skipped_excluded',
  'requests_skipped_no_slot',
  'requests_skipped_manual_exists',
  'requests_skipped_no_role_cap',
  'requests_skipped_not_home_guild',
  'events_deferred_sync_lag',
  'events_deferred_battle_tracker_lag',
  'events_skipped_retroactive',
  'events_skipped_no_tracked_battle',
  'events_skipped_royal_zone',
  'events_skipped_non_combat',
  'events_skipped_regear_disabled',
  'duration_ms',
] as const

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function includeDetails(request: Request): boolean {
  return new URL(request.url).searchParams.get('details') === '1'
}

function summarizeResults(results: Array<Record<string, unknown>>): Record<string, number> {
  const summary: Record<string, number> = {
    tenants: results.length,
    tenants_with_errors: 0,
  }
  for (const field of SUMMARY_FIELDS) summary[field] = 0

  for (const result of results) {
    if (typeof result.error === 'string') summary.tenants_with_errors += 1
    const errors = result.errors
    if (Array.isArray(errors) && errors.length > 0) {
      summary.tenants_with_errors += 1
    }
    for (const field of SUMMARY_FIELDS) {
      summary[field] += numeric(result[field])
    }
  }

  return summary
}

export async function GET(request: Request) {
  return withCronRun(request, { jobName: 'auto-regear', leaseSeconds: 300 }, async ({ db }) => {
    const tenants = await listActiveTenants()
    const nowIso = new Date().toISOString()
    const results: Array<Record<string, unknown>> = []
    let anyCreated = false

    for (const tenant of tenants) {
      try {
        const result = await processAutoRegear(db, tenant.id)
        await db
          .from('app_settings')
          .upsert(
            { guild_id: tenant.id, key: 'last_auto_regear_at', value: nowIso, updated_at: nowIso },
            { onConflict: 'guild_id,key' },
          )
        if (result.requests_created > 0) anyCreated = true
        results.push({ tenant: tenant.slug, ...result })
      } catch (e) {
        results.push({
          tenant: tenant.slug,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    if (anyCreated) {
      revalidatePath('/admin/dashboard/regear')
      revalidatePath('/admin/dashboard/approvals')
    }

    const summary = summarizeResults(results)
    if (summary.requests_created > 0 || summary.tenants_with_errors > 0) {
      log.info('[cron/auto-regear] complete', summary)
    }
    return NextResponse.json(
      includeDetails(request) ? { summary, tenants: results } : { summary },
    )
  })
}
