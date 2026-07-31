import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const action = readFileSync(
  join(process.cwd(), 'src/app/actions/admin-event.ts'),
  'utf8',
)

describe('event clone source boundary', () => {
  it('copies reusable build demand but no callers or operational history', () => {
    const cloneStart = action.indexOf('export async function cloneEvent')
    const cloneEnd = action.indexOf('export async function deleteEvent')
    const clone = action.slice(cloneStart, cloneEnd)

    expect(clone).toContain("from('event_build_role_demands')")
    for (const forbidden of [
      "from('event_build_party_assigners')",
      "from('event_build_applications')",
      "from('event_tentative_signups')",
      "from('event_participation_closeouts')",
      "from('event_after_action_reviews')",
      "from('regear_requests')",
      "from('craft_tasks')",
      "from('loot_audits')",
    ]) {
      expect(clone).not.toContain(forbidden)
    }
    expect(clone).toContain('buildClonedSlotRow')
    expect(clone).toContain("status: 'draft'")
  })
})
