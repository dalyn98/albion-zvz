import { NextResponse } from 'next/server'
import { runAccountAlbionSync } from '@/lib/account-albion-sync'
import { listActiveTenants } from '@/lib/tenant'
import { withCronRun } from '@/lib/cron-run'
import { parseBoundedInt } from '@/lib/parse-bounded-int'

// Discord 계정 ↔ Albion 캐릭터 매핑을 하루 1회 최신화한다.
// 멤버의 길드/연합 상태가 바뀌면 재화 기능 신뢰 상태를 자동으로 낮추고,
// 관리자는 통계의 검토 목록에서 확인/승인한다.

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DEFAULT_CRON_BATCH_SIZE = 10
const SUMMARY_FIELDS = ['scanned', 'refreshed', 'failed', 'skipped'] as const

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function includeDetails(request: Request): boolean {
  return new URL(request.url).searchParams.get('details') === '1'
}

function summarizeResults(results: Array<Record<string, unknown>>, batchSize: number): Record<string, number> {
  const summary: Record<string, number> = {
    batch_size: batchSize,
    tenants: results.length,
    tenants_skipped: 0,
    tenants_with_errors: 0,
  }
  for (const field of SUMMARY_FIELDS) summary[field] = 0

  for (const result of results) {
    if (typeof result.skipped === 'string') summary.tenants_skipped += 1
    if (typeof result.error === 'string') summary.tenants_with_errors += 1
    for (const field of SUMMARY_FIELDS) {
      summary[field] += numeric(result[field])
    }
  }

  return summary
}

export async function GET(request: Request) {
  return withCronRun(request, { jobName: 'account-albion-sync', leaseSeconds: 300 }, async () => {
    const url = new URL(request.url)
    const batchSize =
      parseBoundedInt(url.searchParams.get('batch_size'), 1, 50) ??
      parseBoundedInt(process.env.ACCOUNT_ALBION_SYNC_BATCH_SIZE, 1, 50) ??
      DEFAULT_CRON_BATCH_SIZE
    const tenants = await listActiveTenants()
    const results: Array<Record<string, unknown>> = []
    for (const tenant of tenants) {
      try {
        const outcome = await runAccountAlbionSync(tenant.id, { batchSize })
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

    const summary = summarizeResults(results, batchSize)
    return NextResponse.json(
      includeDetails(request) ? { summary, tenants: results } : { summary },
    )
  })
}
