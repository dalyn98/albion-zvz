import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'src/app/(public-shell)/demo/_components/DemoSidebar.tsx'),
  'utf8',
)

describe('demo mobile drawer accessibility', () => {
  it('matches the application drawer modal and keyboard contract', () => {
    expect(source).toContain('aria-expanded={mobileDrawer}')
    expect(source).toContain("role={mobileDrawer ? 'dialog' : undefined}")
    expect(source).toContain('aria-modal={mobileDrawer ? true : undefined}')
    expect(source).toContain("event.key === 'Escape'")
    expect(source).toContain("document.body.style.overflow = 'hidden'")
    expect(source).toContain("window.matchMedia('(min-width: 1024px)')")
    expect(source).toContain('closeDrawerOnDesktop')
    expect(source).toContain("querySelector<HTMLElement>('[data-mobile-drawer-close]')")
    expect(source).toContain('window.setTimeout')
    expect(source).toContain('data-mobile-drawer-close')
  })
})
