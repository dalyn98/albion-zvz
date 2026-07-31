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
    const action = source('src/app/actions/event-report.ts')

    expect(page).toContain(
      'href={`/battles/${b.id}?event=${event.id}&fromEvent=${event.id}#killbot-event-${event.id}`}',
    )
    expect(page).toContain('canOpenBattleRecords')
    expect(action).toContain('trackedBattleIds: battleIds')
  })

  it('does not infer unrelated tracked battles for non-combat events', () => {
    const action = source('src/app/actions/event-report.ts')

    expect(action).toMatch(
      /event\.category === '전투'[\s\S]*?findTrackedBattleIdsForEvent\(db, guildId, startedIso\)[\s\S]*?: \[\]/,
    )
  })

  it('keeps closeout requirements independent from operator permissions', () => {
    const page = source('src/app/(app-shell)/events/[id]/report/page.tsx')
    const action = source('src/app/actions/event-report.ts')

    expect(page).toContain(
      'const battleRequired = report.attendance.linkedBattleCount > 0',
    )
    expect(page).toContain('lootAuditRequired: operations.lootAuditRequired,')
    expect(page).not.toContain(
      'lootAuditRequired: operations.lootAuditRequired && operations.canAuditLoot',
    )
    expect(action).toContain('lootAuditRequired: closeoutLootAudits.length > 0')
  })

  it('shows objective operations and participation without subjective battle grading', () => {
    const page = source('src/app/(app-shell)/events/[id]/report/page.tsx')

    expect(page).not.toContain('BattleResultBadge')
    expect(page).not.toContain('topKillers')
    expect(page).not.toContain('report.survival')
    expect(page).not.toContain('report.combat')
    expect(page).not.toContain('killDeathsSub')
    expect(page).not.toContain('EventAfterActionReviewCard')
  })

  it('carries an event scope into regear review and loot audit creation', () => {
    const approvals = source('src/app/(app-shell)/admin/dashboard/approvals/page.tsx')
    const regearAction = source('src/app/actions/regear-admin-list.ts')
    const lootForm = source('src/app/(app-shell)/admin/dashboard/loot-audit/LootAuditForm.tsx')
    const lootAction = source('src/app/actions/loot-audit.ts')

    expect(approvals).toContain('event?: string')
    expect(approvals).toContain('eventId={eventId}')
    expect(regearAction).toContain("query = query.eq('event_id', eventId)")
    expect(lootForm).toContain('eventId: initialEventId')
    expect(lootAction).toContain('event_id: eventId')
    expect(lootAction).toMatch(
      /\.from\('events'\)[\s\S]*?\.eq\('guild_id', guildId\)[\s\S]*?\.eq\('id', eventId\)/,
    )
  })

  it('keeps an event-derived loot audit title within the server limit', () => {
    const lootForm = source('src/app/(app-shell)/admin/dashboard/loot-audit/LootAuditForm.tsx')

    expect(lootForm).toContain('const TITLE_MAX_LENGTH = 120')
    expect(lootForm).toContain('initialTitle.slice(0, TITLE_MAX_LENGTH)')
  })
})
