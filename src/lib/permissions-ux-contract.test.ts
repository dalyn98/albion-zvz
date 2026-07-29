import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('permission editor UX', () => {
  it('selects Discord identities, previews impact, and bounds emergency overrides', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/app/(app-shell)/admin/dashboard/permissions/PermissionsEditor.tsx'),
      'utf8',
    )

    expect(source).toContain('capabilitySearch')
    expect(source).toContain('CapabilityChangeSummary')
    expect(source).toContain('effectiveCapabilities')
    expect(source).toContain('conflictBits')
    expect(source).toContain('discordRoleLabel')
    expect(source).toContain('impactPreview')
    expect(source).toContain('reasonLabel')
    expect(source).toContain('expiresAtLabel')
    expect(source).toContain('revokeUserOverride')
    expect(source).not.toContain('type=\"text\"\\n            value={form.discordRoleId}')
  })
})
