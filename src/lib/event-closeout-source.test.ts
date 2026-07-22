import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('event closeout workflow source contracts', () => {
  it('does not query event outcome columns removed by migration 045', () => {
    const action = source('src/app/actions/event-report.ts')

    expect(action).not.toContain(".select('id, title, battle_started_at, outcome, finalized_at")
    expect(action).toContain(".from('guild_battle_views')")
  })

  it('links tracked battle projections from the event report', () => {
    const page = source('src/app/(app-shell)/events/[id]/report/page.tsx')

    expect(page).toContain('href={`/battles/${b.id}?fromEvent=${event.id}`}')
  })

  it('carries an event scope into regear review and loot audit creation', () => {
    const approvals = source('src/app/(app-shell)/admin/dashboard/approvals/page.tsx')
    const lootForm = source('src/app/(app-shell)/admin/dashboard/loot-audit/LootAuditForm.tsx')
    const lootAction = source('src/app/actions/loot-audit.ts')

    expect(approvals).toContain('event?: string')
    expect(approvals).toContain('eventId={eventId}')
    expect(lootForm).toContain('eventId: initialEventId')
    expect(lootAction).toContain('event_id: eventId')
  })
})
