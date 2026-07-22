import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('public AGM Battles visibility wiring', () => {
  it.each([
    'src/components/MarketingNav.tsx',
    'src/components/MarketingFooter.tsx',
    'src/components/AppSidebar.tsx',
    'src/app/sitemap.ts',
  ])('uses the public collection visibility gate in %s', (path) => {
    expect(source(path)).toContain('PUBLIC_AGM_BATTLES_AVAILABLE')
  })

  it('shows the pause panel on the direct public board route', () => {
    const page = source(
      'src/app/(public-shell)/public/(marketing)/zvz-battles/page.tsx',
    )

    expect(page).toContain('arePublicAgmBattlesAvailable')
  })
})
