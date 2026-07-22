import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('demo localization source', () => {
  it.each([
    'src/app/(public-shell)/demo/me/page.tsx',
    'src/app/(public-shell)/demo/me/profile/page.tsx',
  ])('does not ship English-only relative time labels in %s', (path) => {
    expect(source(path)).not.toMatch(/['`](?:Today|Yesterday|\d+[hd] ago)(?:\s|['`])/)
  })

  it('formats relative hours through the shared demo translator', () => {
    expect(source('src/app/(public-shell)/demo/_lib/format.ts')).toContain(
      'formatRelativeHoursLabel',
    )
  })
})
