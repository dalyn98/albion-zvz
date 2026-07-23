import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const SEARCH_ROOTS = ['src/app', 'src/components']
const ALLOWED_DIRECT_START_FILES = new Set([
  'src/app/api/auth/discord/start/route.ts',
  'src/components/LoginEntry.tsx',
])

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.test.ts')
      ? [path]
      : []
  })
}

describe('external login entry coverage', () => {
  it('does not bypass the recoverable login entry from pages or CTA components', () => {
    const violations = SEARCH_ROOTS
      .flatMap((dir) => sourceFiles(join(ROOT, dir)))
      .map((path) => ({
        path: relative(ROOT, path),
        source: readFileSync(path, 'utf8'),
      }))
      .filter(({ path, source }) =>
        !ALLOWED_DIRECT_START_FILES.has(path) &&
        (
          source.includes('/api/auth/discord/start') ||
          source.includes('buildDiscordStartHref')
        ),
      )
      .map(({ path }) => path)

    expect(violations).toEqual([])
  })

  it('keeps transient login and bot-install recovery pages out of search results', () => {
    const loginSource = readFileSync(
      join(ROOT, 'src/app/(public-shell)/login/page.tsx'),
      'utf8',
    )
    const inviteRecoverySource = readFileSync(
      join(ROOT, 'src/app/(public-shell)/invite/open/page.tsx'),
      'utf8',
    )
    const robots = readFileSync(join(ROOT, 'public/robots.txt'), 'utf8')

    for (const source of [loginSource, inviteRecoverySource]) {
      expect(source).toContain('robots:')
      expect(source).toContain('index: false')
      expect(source).toContain('follow: false')
    }
    expect(robots).toContain('Disallow: /login')
    expect(robots).toContain('Disallow: /invite/open')
  })
})
