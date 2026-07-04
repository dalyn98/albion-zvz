import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { listActiveTenants } from '@/lib/tenant'
import { syncTenantShopPrices } from '@/lib/shop/price-sync'
import { log } from '@/lib/log'
import { withCronRun } from '@/lib/cron-run'
import { markPublicShopCacheStale } from '@/lib/shop/cache'

// /shop 의 auto_price_silver staleness 해소용 cron. 1시간 주기로 모든 active
// 테넌트를 순회하면서 syncTenantShopPrices 호출. 자동 리기어가 매 cron 라이브
// fetch 라 시세가 항상 최신인 반면, 상점은 어드민이 동기화 버튼을 눌러야만
// 갱신됐기 때문에 둘 사이 staleness gap 이 생겼던 문제를 cron 으로 해소.
//
// 같은 tenant 의 어드민이 직전에 수동 동기화를 눌렀어도 멱등 — 같은 시세 값을
// 다시 쓰는 정도라 부작용 없음. AODP 호출 비용은 tenant 당 키 수에 비례하지만
// 5분 cron 은 과하고 24시간 cron 은 부족해 1시간으로 시작.

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const SUMMARY_FIELDS = ['requested', 'updated', 'missing'] as const

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
    for (const field of SUMMARY_FIELDS) {
      summary[field] += numeric(result[field])
    }
  }

  return summary
}

export async function GET(request: Request) {
  return withCronRun(request, { jobName: 'shop-price-sync', leaseSeconds: 900 }, async ({ db }) => {
    const tenants = await listActiveTenants()
    const results: Array<Record<string, unknown>> = []
    let anyUpdated = false

    for (const tenant of tenants) {
      try {
        const r = await syncTenantShopPrices(db, tenant.id)
        if (r.updated > 0) {
          markPublicShopCacheStale(tenant.id)
          anyUpdated = true
        }
        results.push({ tenant: tenant.slug, ...r })
      } catch (e) {
        results.push({
          tenant: tenant.slug,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    if (anyUpdated) {
      revalidatePath('/admin/dashboard/shop')
      revalidatePath('/shop')
    }

    const summary = summarizeResults(results)
    if (summary.updated > 0 || summary.tenants_with_errors > 0) {
      log.info('[cron/shop-price-sync] complete', summary)
    }
    return NextResponse.json(
      includeDetails(request) ? { summary, tenants: results } : { summary },
    )
  })
}
