import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('event operations security boundaries', () => {
  it('gates tactic writes through event ownership and tenant-scoped RPC input', () => {
    const action = source('src/app/actions/event-operations.ts')

    expect(action).toContain('requireEventCreatorForEvent')
    expect(action).toContain('p_guild_id: guildId')
    expect(action).toContain("message.includes('Unauthorized')")
    expect(action).not.toContain('event_after_action_reviews')
    expect(action).not.toContain('saveEventAfterActionReview')
  })

  it('gates operational cancellation through ownership and tenant-scoped RPC input', () => {
    const action = source('src/app/actions/event-operations.ts')

    expect(action).toContain('cancelEventOperations')
    expect(action).toContain("db.rpc('cancel_event_operations'")
    expect(action).toContain('p_guild_id: guildId')
    expect(action).toContain('p_actor_discord_id: session.discordId')
    expect(action).toContain("action: 'event.cancel'")
  })

  it('loads tactics only after report authorization and omits the retired AAR', () => {
    const page = source('src/app/(app-shell)/events/[id]/report/page.tsx')
    const authorizationIndex = page.indexOf('if (!result) notFound()')
    const tacticLoadIndex = page.indexOf('canViewTactic')

    expect(authorizationIndex).toBeGreaterThan(-1)
    expect(tacticLoadIndex).toBeGreaterThan(authorizationIndex)
    expect(page).not.toContain('loadEventAfterActionReview')
    expect(page).not.toContain('EventAfterActionReviewCard')
    expect(page).not.toContain('canViewAfterActionReview')
  })
})
