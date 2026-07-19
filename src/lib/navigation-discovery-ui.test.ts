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

  it('separates area disclosure from route links and supports local keyboard search', () => {
    const source = read('src/components/AreaNavigation.tsx')

    expect(source).toContain('aria-expanded={areaOpen}')
    expect(source).toContain('onClick={() => toggleArea(group.area)}')
    expect(source).toContain("event.key.toLocaleLowerCase() === 'k'")
    expect(source).toContain('searchNavigationItems(searchItems, query)')
    expect(source).toContain('prefetch={false}')
    expect(source).toContain('role="dialog"')
    expect(source).toContain('data-feature-search-dialog')
  })

  it('keeps mobile primary destinations as direct links', () => {
    const app = read('src/components/AppSidebar.tsx')
    const demo = read('src/app/(public-shell)/demo/_components/DemoSidebar.tsx')

    expect(app).toContain('isMobileNavigationItemActive(pathname ||')
    expect(app).toContain("className={`safe-area-bottom fixed")
    expect(demo).toContain('grid min-h-14 grid-cols-5')
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
})
