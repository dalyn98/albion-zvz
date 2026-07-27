import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('UX refresh source invariants', () => {
  it('keeps core mobile controls at least 40px tall', () => {
    expect(source('src/components/LanguageSwitcher.tsx')).toContain('min-h-10 min-w-10')
    expect(source('src/components/AppSidebar.tsx')).toContain('h-10 w-10')
    expect(source('src/components/RegearReviewRow.tsx')).toContain('min-h-10')
  })

  it('uses adaptive event layout rather than a fixed two-column grid', () => {
    const eventList = source('src/components/HomeEventList.tsx')
    expect(eventList).toContain('resolveHomeEventLayout')
    expect(eventList).toContain('adaptiveLayout = false')
    expect(eventList).toContain('adaptiveLayout={adaptiveLayout}')
  })

  it('keeps the public approval demo structurally in parity with all real queues', () => {
    const demo = source('src/app/(public-shell)/demo/regear/page.tsx')
    expect(demo).toContain("'member_trade'")
    expect(demo).toContain("tabMemberTrade")
  })

  it('gates refresh styling but measures every authenticated workflow', () => {
    const shell = source('src/components/AppShell.tsx')
    const chrome = source('src/components/AppShellClientChrome.tsx')
    expect(shell).toContain("getAppSetting('ux_refresh_v2_enabled'")
    expect(chrome).toContain('UxTelemetryTracker')
    expect(chrome).toContain('enabled={Boolean(session)}')
    expect(chrome).toContain('ux-refresh-v2')
  })

  it('uses progressive disclosure for regear evidence while keeping decisions prominent', () => {
    const row = source('src/components/RegearReviewRow.tsx')
    expect(row).toContain('reviewEvidence')
    expect(row).toContain('data-ux-event="approval_action"')
    expect(row).toContain('data-ux-event="detail_toggle"')
  })

  it('replaces oversized member metrics and persistent shop setup cards with compact bands', () => {
    const memberMetrics = source('src/components/MemberPriorityMetrics.tsx')
    const shop = source('src/app/(app-shell)/admin/dashboard/shop/page.tsx')
    expect(memberMetrics).not.toContain('min-h-36')
    expect(memberMetrics).toContain('divide-y')
    expect(shop).not.toContain('<OverviewMetric')
    expect(shop).toContain('ShopHealthRow')
  })
})
