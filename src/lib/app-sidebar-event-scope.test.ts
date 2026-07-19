import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  join(process.cwd(), 'src/components/AppSidebar.tsx'),
  'utf8',
)

describe('event-scoped guest sidebar', () => {
  it('keeps identity, brand, and status navigation on the signed event', () => {
    expect(source).toContain('const brandHref = eventScopeHref ?? publicProfileHref')
    expect(source).toContain("eventScopeHref ? tNav('operations')")
    expect(source).toContain('userStatus && !eventScopeHref')
    expect(source).toContain('!eventScopeHref && <div')
  })
})
