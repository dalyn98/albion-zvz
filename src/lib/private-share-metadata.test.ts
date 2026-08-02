import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('private share metadata', () => {
  it.each([
    'src/app/(public-shell)/public/u/layout.tsx',
    'src/app/(public-shell)/tactics/share/layout.tsx',
  ])('keeps token routes unlisted and suppresses referrers: %s', (path) => {
    const source = read(path)
    expect(source).toContain('index: false')
    expect(source).toContain('follow: false')
    expect(source).toContain("referrer: 'no-referrer'")
  })

  it('keeps event invite query tokens out of indexing and referrers', () => {
    const source = read('src/app/(app-shell)/events/[id]/page.tsx')
    expect(source).toContain('PRIVATE_EVENT_LINK_METADATA')
    expect(source).toContain('index: false')
    expect(source).toContain("referrer: 'no-referrer'")
    expect(source).toContain('if (!tenant) return PRIVATE_EVENT_LINK_METADATA')
    expect(source).toContain('...PRIVATE_EVENT_LINK_METADATA')
  })
})
