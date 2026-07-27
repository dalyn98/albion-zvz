import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('RSC to Client component boundary contract', () => {
  it('keeps battle-list formatter functions inside the Client component', () => {
    const page = readFileSync(
      join(process.cwd(), 'src/app/(app-shell)/battles/page.tsx'),
      'utf8',
    )
    const client = readFileSync(
      join(process.cwd(), 'src/components/BattleEngagementList.tsx'),
      'utf8',
    )

    expect(page).not.toMatch(
      /(?:engagementNumber|rawBattle|eventCount|otherEvents|interventionEvents|lastVerified|completeness|players):\s*\(/,
    )
    expect(client.startsWith("'use client'")).toBe(true)
    expect(client).toContain("useTranslations('battleTracking')")
  })
})
