import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(file: string): string {
  return readFileSync(join(process.cwd(), file), 'utf8')
}

describe('public profile performance source', () => {
  it('deduplicates identical battle rollups within a server render', () => {
    const source = read('src/lib/guild-battle-rollup.ts')

    expect(source).toContain("import { cache } from 'react'")
    expect(source).toContain('const loadGuildBattleRollupCached = cache(')
  })

  it('loads translations and request metadata with the data fan-out', () => {
    const source = read('src/app/(app-shell)/public/(marketing)/g/[slug]/page.tsx')
    const pageBody = source.slice(source.indexOf('export default async function GuildProfilePage'))

    expect(pageBody).not.toContain("const t = await getTranslations('publicGuildProfile')")
    expect(pageBody).toContain("getTranslations('publicGuildProfile')")
    expect(pageBody).toContain('getMarketingPaths(),')
    expect(pageBody).toContain('getLocale(),')
  })
})
