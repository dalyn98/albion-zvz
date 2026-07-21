import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(file: string): string {
  return readFileSync(join(process.cwd(), file), 'utf8')
}

describe('area navigation discovery UI', () => {
  it('uses the same area-first discovery surface in the product and demo', () => {
    const app = read('src/components/AppSidebar.tsx')
    const demo = read('src/app/(public-shell)/demo/_components/DemoSidebar.tsx')

    expect(app).toContain('<AreaNavigation')
    expect(demo).toContain('<AreaNavigation')
    expect(app).not.toContain('resolveAppArea(item.href) === activeArea')
    expect(demo).not.toContain('resolveAppArea(item.href) === activeArea')
  })

  it('separates contextual area links from disclosure buttons and supports local keyboard search', () => {
    const source = read('src/components/AreaNavigation.tsx')

    expect(source).toContain('aria-expanded={areaOpen}')
    expect(source).toContain('onClick={() => toggleArea(group.area)}')
    expect(source).toContain('href={destination.href}')
    expect(source).toContain('destination.destinationLabel')
    expect(source).toContain("window.matchMedia('(max-width: 1023px)')")
    expect(source).toContain("event.key.toLocaleLowerCase() === 'k'")
    expect(source).toContain('searchNavigationItems(searchItems, query)')
    expect(source).toContain('prefetch={false}')
    expect(source).toContain('role="dialog"')
    expect(source).toContain('data-feature-search-dialog')
  })

  it('keeps mobile primary destinations as direct links', () => {
    const app = read('src/components/AppSidebar.tsx')
    const demo = read('src/app/(public-shell)/demo/_components/DemoSidebar.tsx')
    const navigationHook = read('src/hooks/use-contextual-area-navigation.ts')

    expect(app).toContain('useContextualAreaNavigation({')
    expect(app).toContain('const active = item.active')
    expect(app).toContain("className={`safe-area-bottom fixed")
    expect(demo).toContain("storageScope: 'demo'")
    expect(demo).toContain('const active = item.active')
    expect(navigationHook).toContain('const currentGroups = getCurrentGroups()')
    expect(navigationHook).toContain('groups: currentGroups')
    expect(navigationHook).not.toContain('groups: getCurrentGroups(),')
  })

  it('retains the onboarding destination for restricted sessions', () => {
    const app = read('src/components/AppSidebar.tsx')

    expect(app).toContain('const discoveryMemberNavItems: NavItem[] = memberNavigationVisible')
    expect(app).toContain('href: sessionProfileHref')
    expect(app).toContain("labelKey: 'guild'")
  })

  it('closes nested feature search before the mobile drawer', () => {
    const app = read('src/components/AppSidebar.tsx')
    const demo = read('src/app/(public-shell)/demo/_components/DemoSidebar.tsx')

    expect(app).toContain("document.querySelector('[data-feature-search-dialog]')")
    expect(demo).toContain("document.querySelector('[data-feature-search-dialog]')")
  })

  it('keeps guidance discoverable without covering the working surface', () => {
    const memberTour = read('src/components/MemberGuidedTour.tsx')
    const demoTour = read('src/app/(public-shell)/demo/_components/DemoGuidedTour.tsx')
    const appSidebar = read('src/components/AppSidebar.tsx')
    const demoLayout = read('src/app/(public-shell)/demo/layout.tsx')

    expect(memberTour).toContain("document.getElementById('member-tour-launcher')")
    expect(demoTour).toContain("document.getElementById('demo-tour-launcher')")
    expect(appSidebar).toContain('id="member-tour-launcher"')
    expect(demoLayout).toContain('id="demo-tour-launcher"')
    expect(memberTour).not.toContain('fixed bottom-')
    expect(demoTour).not.toContain('fixed bottom-')
  })

  it('puts the next member action and event list before supporting metrics', () => {
    const demoMe = read('src/app/(public-shell)/demo/me/page.tsx')
    const demoEvents = read('src/app/(public-shell)/demo/events/page.tsx')

    expect(demoMe.indexOf('<MemberNextActionsPanel')).toBeLessThan(
      demoMe.indexOf('<MemberPriorityMetrics'),
    )
    expect(demoEvents.indexOf('data-tour-id="events-content"')).toBeLessThan(
      demoEvents.indexOf('<DemoOperationsOverview'),
    )
  })

  it('uses a mobile queue picker and keeps transient feedback above bottom navigation', () => {
    const approvals = read('src/app/(app-shell)/admin/dashboard/approvals/page.tsx')
    const demoApprovals = read('src/app/(public-shell)/demo/regear/page.tsx')
    const picker = read('src/components/ApprovalQueuePicker.tsx')
    const toasts = read('src/components/ToastProvider.tsx')

    expect(approvals).toContain('<ApprovalQueuePicker')
    expect(approvals).toContain('className="approval-mobile-filters group"')
    expect(demoApprovals).toContain('<ApprovalQueuePicker')
    expect(demoApprovals).toContain('className="approval-mobile-filters group"')
    expect(picker).toContain('aria-modal="true"')
    expect(picker).toContain("event.key !== 'Tab'")
    expect(toasts).toContain('bottom-[calc(4.5rem+env(safe-area-inset-bottom))]')
  })
})
