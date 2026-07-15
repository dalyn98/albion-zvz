import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('Design Refresh v3 completion contract', () => {
  it('rolls out with an independent Menhera-only setting', () => {
    const migrationPath = 'supabase/migrations/265_enable_menhera_visual_refresh_v3.sql'
    expect(existsSync(join(process.cwd(), migrationPath))).toBe(true)
    const migration = source(migrationPath)
    const settings = source('src/lib/app-settings.ts')
    const shell = source('src/components/AppShell.tsx')
    const chrome = source('src/components/AppShellClientChrome.tsx')

    expect(migration).toMatch(/visual_refresh_v3_enabled/i)
    expect(migration).toMatch(/where\s+t\.slug\s*=\s*'menhera'/i)
    expect(migration).toMatch(/on\s+conflict\s*\(guild_id,\s*key\)/i)
    expect(settings).toContain("'visual_refresh_v3_enabled'")
    expect(shell).toContain('VISUAL_REFRESH_V3_SETTING_KEY')
    expect(chrome).toContain('data-visual-refresh')
    expect(chrome).toContain('visual-refresh-v3')
  })

  it('provides the shared tactical-console primitives', () => {
    const patterns = source('src/components/ui-patterns.tsx')
    const styles = source('src/app/globals.css')

    expect(patterns).toContain('export function ListSurface')
    expect(patterns).toContain('export function ListRow')
    expect(patterns).toContain('export function MetricStrip')
    expect(patterns).toContain('export function StickyActionBar')
    expect(patterns).toContain('export function FulfillmentStrip')
    expect(styles).toContain('--color-price')
    expect(styles).toContain('--radius-panel')
    expect(styles).toContain('--duration-interactive')
    expect(styles).toContain('.visual-refresh-v3')
    expect(styles).toContain('.v3-legacy-surface')
    expect(styles).not.toContain('transition: all')
  })

  it('gives the shell, approvals, member home, and shop distinct v3 workspaces', () => {
    const sidebar = source('src/components/AppSidebar.tsx')
    const approvals = source('src/app/(app-shell)/admin/dashboard/approvals/page.tsx')
    const regearRow = source('src/components/RegearReviewRow.tsx')
    const memberPage = source('src/app/(app-shell)/me/page.tsx')
    const memberDashboard = source('src/components/MyHomeDashboardCard.tsx')
    const shop = source('src/components/ShopCatalog.tsx')
    const shopPage = source('src/app/(app-shell)/shop/page.tsx')

    expect(sidebar).toContain('visualRefreshEnabled')
    expect(sidebar).toContain('v3-navigation')
    expect(approvals).toContain('v3-approval-workspace')
    expect(approvals).toContain('getQueueCountTone')
    expect(regearRow).toContain('v3-decision-row')
    expect(memberPage).toContain('v3-member-workspace')
    expect(memberDashboard).toContain('v3-member-overview')
    expect(shopPage).toContain('visualRefreshEnabled')
    expect(shopPage).toContain('v3-shop-workspace')
    expect(shop).toContain('v3-mobile-cart-bar')
  })

  it('extends the visual language to events, battles, regear, and shaped states', () => {
    const events = source('src/components/HomeEventList.tsx')
    const battles = source('src/app/(app-shell)/battles/page.tsx')
    const regear = source('src/app/(app-shell)/regear/page.tsx')
    const states = source('src/components/ui-patterns.tsx')

    expect(events).toContain('v3-event-timeline')
    expect(battles).toContain('v3-data-workspace')
    expect(regear).toContain('v3-regear-workspace')
    expect(states).toContain('export function ErrorState')
    expect(states).toContain('export function SkeletonRows')
  })

  it('uses contextual coachmarks and keeps the public demo in visual parity', () => {
    const memberTour = source('src/components/MemberGuidedTour.tsx')
    const demoTour = source('src/app/(public-shell)/demo/_components/DemoGuidedTour.tsx')
    const demoShell = source('src/app/(public-shell)/demo/layout.tsx')
    const demoApprovals = source('src/app/(public-shell)/demo/regear/page.tsx')
    const demoMember = source('src/app/(public-shell)/demo/me/page.tsx')
    const demoShop = source('src/app/(public-shell)/demo/shop/page.tsx')

    expect(memberTour).toContain('tour-coachmark')
    expect(memberTour).toContain('tour-mobile-sheet')
    expect(demoTour).toContain('tour-coachmark')
    expect(demoTour).toContain('tour-mobile-sheet')
    expect(demoShell).toContain('v3-demo-status')
    expect(demoApprovals).toContain('v3-approval-workspace')
    expect(demoMember).toContain('v3-member-workspace')
    expect(demoShop).toContain('v3-shop-workspace')
  })

  it('does not add a client animation dependency for the refresh', () => {
    const packageJson = source('package.json')
    expect(packageJson).not.toMatch(/"(?:motion|framer-motion)"\s*:/)
  })
})
