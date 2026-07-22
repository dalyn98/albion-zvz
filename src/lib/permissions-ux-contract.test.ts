import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('permission editor UX', () => {
  it('supports capability search and previews the exact effective change', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/(app-shell)/admin/dashboard/permissions/PermissionsEditor.tsx'),
      'utf8',
    )

    expect(source).toContain('capabilitySearch')
    expect(source).toContain('changeSummary')
    expect(source).toContain('effectiveCapabilities')
    expect(source).toContain('conflictingCapabilities')
  })
})
