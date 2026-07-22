import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('leaderboard polish rollout contract', () => {
  it('ships the polished experience to every tenant without a slug gate', () => {
    const source = readFileSync(
      resolve(root, 'src/app/(app-shell)/leaderboard/page.tsx'),
      'utf8',
    )

    expect(source).not.toContain('isLeaderboardPolishV2')
    expect(source).not.toContain('getTenantDiscordConfig')
    expect(source).not.toContain('polishV2')
    expect(source).toContain("t('justUpdated')")
    expect(source).toContain('lb-rank1-glow')
    expect(source).toContain('lb-row-in')
  })

  it('removes the completed rollout flag module', () => {
    expect(() =>
      readFileSync(resolve(root, 'src/lib/polish-flags.ts'), 'utf8'),
    ).toThrow()
  })
})
