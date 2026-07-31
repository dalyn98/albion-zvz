export const LEGACY_ADMIN_ROLE_MIGRATION_NOTE =
  'Migrated from tenants.admin_role_ids'

export function formatRoleGrantNoteForDisplay(
  note: string,
  localizedLegacyNote: string,
): string {
  return note === LEGACY_ADMIN_ROLE_MIGRATION_NOTE ? localizedLegacyNote : note
}
