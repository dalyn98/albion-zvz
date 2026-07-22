import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('data workflow UX', () => {
  it('makes battle filters removable, preserves the view, and supports load-more', () => {
    const battles = source('src/components/BattleRecordList.tsx')
    expect(battles).toContain('removeActiveFilter')
    expect(battles).toContain('resetFiltersHref')
    expect(battles).toContain('visibleSessionCount')
    expect(battles).toContain('overrideReceipt')
    expect(battles).toContain('undoAction')
    expect(battles).toContain('overrideActionByKeyRef')
    expect(battles).toContain('undoActivityOverride')
  })

  it('lets operators compare two members within the active cohort', () => {
    const members = source('src/components/GuildMemberList.tsx')
    expect(members).toContain('selectedMemberIds')
    expect(members).toContain('compareMembers')
    expect(members).toContain('comparePanel')
  })

  it('requires a reviewed reason for compliance exclusions and video rejection', () => {
    const panel = source('src/components/AllianceContentComplianceAdminPanel.tsx')
    const action = source('src/app/actions/alliance-content-compliance.ts')
    expect(panel).toContain('reviewIntent')
    expect(panel).toContain('reviewReason')
    expect(panel).toContain('commitReviewedDecision')
    expect(action).toContain('p_review_note: reviewNote')
    expect(action).toContain('exclusionReason')
  })
})
