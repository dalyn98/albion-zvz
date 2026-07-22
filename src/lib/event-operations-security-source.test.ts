import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('event operations security boundaries', () => {
  it('gates tactic and AAR writes through event ownership and tenant-scoped data', () => {
    const action = source('src/app/actions/event-operations.ts')

    expect(action).toContain('requireEventCreatorForEvent')
    expect(action).toContain("p_guild_id: guildId")
    expect(action).toContain(".eq('guild_id', guildId)")
    expect(action).toContain("{ onConflict: 'guild_id,event_id' }")
    expect(action).toContain("message.includes('Unauthorized')")
  })

  it('does not load internal tactic or AAR content before report authorization', () => {
    const page = source('src/app/(app-shell)/events/[id]/report/page.tsx')
    const authorizationIndex = page.indexOf('if (!result) notFound()')
    const tacticLoadIndex = page.indexOf('canViewTactic ? getEventTacticSnapshotSummary')
    const aarLoadIndex = page.indexOf('? loadEventAfterActionReview')

    expect(authorizationIndex).toBeGreaterThan(-1)
    expect(tacticLoadIndex).toBeGreaterThan(authorizationIndex)
    expect(aarLoadIndex).toBeGreaterThan(authorizationIndex)
    expect(page).toContain('canViewAfterActionReview && (')
  })
})
