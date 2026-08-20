import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('Discord mobile web handoff source boundary', () => {
  it('keeps the landing GET side-effect free and consumes only from the explicit form POST', () => {
    const page = source('src/app/(public-shell)/discord/continue/page.tsx')
    const route = source('src/app/api/auth/discord/app/consume/route.ts')

    expect(page).toContain('inspectDiscordAppLoginLink')
    expect(page).toContain('method="post"')
    expect(page).toContain('action="/api/auth/discord/app/consume"')
    expect(route).toContain('export async function POST')
    expect(route).toContain('303')
  })

  it('uses personalized Discord component buttons instead of public unauthenticated URLs', () => {
    const panel = source('src/lib/discord-quick-starter.ts')

    expect(panel).toContain('DISCORD_MEMBER_PANEL_CUSTOM_IDS.event')
    expect(panel).toContain('DISCORD_MEMBER_PANEL_CUSTOM_IDS.exchange')
    expect(panel).toContain('DISCORD_MEMBER_PANEL_CUSTOM_IDS.regear')
    expect(panel).not.toContain("style: 5,\n        label: input.labels.events")
  })
})
