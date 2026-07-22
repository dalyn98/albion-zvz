import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const actionSource = readFileSync(
  join(process.cwd(), 'src/app/actions/event-report.ts'),
  'utf8',
)
const pageSource = readFileSync(
  join(process.cwd(), 'src/app/(app-shell)/events/[id]/report/page.tsx'),
  'utf8',
)

describe('event battle explainability', () => {
  it('loads the ledger evidence and classification fields for every linked matchup', () => {
    for (const field of [
      'evidence_source',
      'view_policy',
      'activity_kind',
      'activity_source',
      'activity_reason',
      'evaluated_at',
    ]) {
      expect(actionSource).toContain(field)
    }
    expect(actionSource).toContain(".eq('tenant_id', guildId)")
    expect(actionSource).toContain(".eq('relation_scope', 'direct')")
  })

  it('renders status, evidence, activity, and a human explanation near the battle row', () => {
    expect(pageSource).toContain('projection_status')
    expect(pageSource).toContain('evidence_source')
    expect(pageSource).toContain('activity_kind')
    expect(pageSource).toContain('activity_reason')
    expect(pageSource).toContain("t('battleWhyLinked')")
  })
})
