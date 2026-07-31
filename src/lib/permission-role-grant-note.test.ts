import { describe, expect, it } from 'vitest'
import {
  formatRoleGrantNoteForDisplay,
  LEGACY_ADMIN_ROLE_MIGRATION_NOTE,
} from './permission-role-grant-note'

describe('permission role grant note display', () => {
  it('replaces the known legacy system note with a localized label', () => {
    const localizedLabel = '기존 관리자 역할 설정에서 이전됨'

    const result = formatRoleGrantNoteForDisplay(
      LEGACY_ADMIN_ROLE_MIGRATION_NOTE,
      localizedLabel,
    )

    expect(result).toBe(localizedLabel)
    expect(result).not.toContain('tenants.admin_role_ids')
  })

  it('preserves arbitrary user-authored notes exactly', () => {
    const userNote = 'Keep this note for the weekend caller.'

    expect(
      formatRoleGrantNoteForDisplay(
        userNote,
        'Migrated from previous administrator role settings',
      ),
    ).toBe(userNote)
  })

  it('does not rewrite similar but non-system notes', () => {
    const similarUserNote = `${LEGACY_ADMIN_ROLE_MIGRATION_NOTE} (checked manually)`

    expect(
      formatRoleGrantNoteForDisplay(
        similarUserNote,
        'Migrated from previous administrator role settings',
      ),
    ).toBe(similarUserNote)
  })
})
