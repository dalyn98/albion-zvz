import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Next.js route config contract', () => {
  it('declares the events alias route config directly instead of re-exporting it', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/(app-shell)/events/page.tsx'),
      'utf8',
    )

    expect(source).toContain("export const dynamic = 'force-dynamic'")
    expect(source).not.toMatch(/export\s*\{[^}]*\bdynamic\b[^}]*\}\s*from/)
  })
})
