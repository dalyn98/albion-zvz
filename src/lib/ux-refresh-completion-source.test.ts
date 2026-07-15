import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('Menhera UX refresh completion invariants', () => {
  it('organizes real approval queues from live badges and feature settings', () => {
    const approvals = source('src/app/(app-shell)/admin/dashboard/approvals/page.tsx')
    expect(approvals).toContain('organizeApprovalQueueTabs')
    expect(approvals).toContain("getAppSetting('craft_regear_enabled'")
    expect(approvals).toContain("getAppSetting('ux_refresh_v2_enabled'")
    expect(approvals).toContain('secondaryTabs')
    expect(approvals).toContain('otherQueuesLabel')
    expect(approvals).toContain('data-ux-event="approval_filter_change"')
    expect(approvals).toContain('uxRefreshEnabled={uxRefreshEnabled}')
    expect(approvals).toContain("params.set('origin', origin)")
  })

  it('keeps major layout changes behind the Menhera rollout setting', () => {
    const regearRow = source('src/components/RegearReviewRow.tsx')
    const memberPage = source('src/app/(app-shell)/me/page.tsx')
    const memberMetrics = source('src/components/MemberPriorityMetrics.tsx')
    const shopPage = source('src/app/(app-shell)/admin/dashboard/shop/page.tsx')
    const homePage = source('src/app/(app-shell)/page.tsx')
    const homeEvents = source('src/components/HomeEventList.tsx')
    expect(regearRow).toContain('uxRefreshEnabled')
    expect(regearRow).toContain('open={!uxRefreshEnabled}')
    expect(memberPage).toContain("getAppSetting('ux_refresh_v2_enabled'")
    expect(memberMetrics).toContain('compact = false')
    expect(shopPage).toContain("getAppSetting('ux_refresh_v2_enabled'")
    expect(shopPage).toContain('uxRefreshEnabled={uxRefreshEnabled}')
    expect(homePage).toContain("getAppSetting('ux_refresh_v2_enabled'")
    expect(homeEvents).toContain('adaptiveLayout = false')
  })

  it('keeps legacy manual requests consistent across lists and relation counts', () => {
    const action = source('src/app/actions/regear-admin-list.ts')
    expect(action.match(/getRegearOriginFilterSpec\(origin\)/g)).toHaveLength(2)
  })

  it('opens the aggregate regear queue from operational entry points', () => {
    const operations = source('src/components/AdminOperationsPanel.tsx')
    const approvals = source('src/app/(app-shell)/admin/dashboard/approvals/page.tsx')
    expect(operations).toContain("regear: '/admin/dashboard/approvals?origin=all'")
    expect(approvals).toContain("key === 'regear' ? '/admin/dashboard/approvals?origin=all'")
  })

  it('uses shaped loading states for the refreshed member and shop workspaces', () => {
    const shopLoadingPath = 'src/app/(app-shell)/admin/dashboard/shop/loading.tsx'
    expect(existsSync(join(process.cwd(), shopLoadingPath))).toBe(true)
    expect(source(shopLoadingPath)).toContain('divide-y')
    expect(source('src/app/(app-shell)/me/loading.tsx')).toContain('divide-y')
  })

  it('keeps public-shell controls touchable and measures only enabled tenant flows', () => {
    const publicShell = source('src/components/PublicShell.tsx')
    const tracker = source('src/components/UxTelemetryTracker.tsx')
    expect(publicShell).toContain("getAppSetting('ux_refresh_v2_enabled'")
    expect(publicShell).toContain('UxTelemetryTracker')
    expect(publicShell).toContain('min-h-10')
    expect(tracker).toContain("pathname.startsWith('/events/')")
    expect(tracker).toMatch(/Math\.min\(\s*MAX_ELAPSED_MS/)
  })

  it('shows a realistic member-trade dispute in the public approval demo', () => {
    const page = source('src/app/(public-shell)/demo/regear/page.tsx')
    const seed = source('src/data/demo-seed/approvals.ts')
    const lists = source('src/app/(public-shell)/demo/_components/DemoApprovalLists.tsx')
    expect(page).toContain('DEMO_MEMBER_TRADE_DISPUTES')
    expect(page).toContain('DemoMemberTradeDisputeReviewList')
    expect(seed).toContain('DEMO_MEMBER_TRADE_DISPUTES')
    expect(lists).toContain('DemoMemberTradeDisputeReviewList')
    expect(seed).not.toContain('거래 완료 표시 후')
  })
})
