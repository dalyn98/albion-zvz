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
    expect(eventList).not.toContain('xl:grid xl:grid-cols-2')
  })

  it('keeps the public approval demo structurally in parity with all real queues', () => {
    const demo = source('src/app/(public-shell)/demo/regear/page.tsx')
    expect(demo).toContain("'member_trade'")
    expect(demo).toContain("tabMemberTrade")
  })
})
