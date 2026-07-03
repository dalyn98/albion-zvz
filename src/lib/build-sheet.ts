import type { SlotRole } from '@/types'

export const BUILD_SHEET_ROLES = [
  'OffTanker',
  'DefTanker',
  'Sup',
  'Healer',
  'EngageDps',
] as const satisfies readonly SlotRole[]

export type BuildSheetRole = (typeof BUILD_SHEET_ROLES)[number]

export const MAX_BUILD_SHEET_PREFERENCES = 3

export interface BuildSheetEntry {
  id: string
  name: string
  role_type: BuildSheetRole
  weapon_name: string
  weapon_id: string
  data: Record<string, unknown>
  created_at?: string
}

export interface BuildSheetPreferenceSnapshot {
  template_id: string
  template_name: string
  role_type: BuildSheetRole
  weapon_name: string
  weapon_id: string
  priority: number
  build_data: Record<string, unknown>
}

export interface BuildSheetApplication {
  id: string
  applicant_discord_id: string
  applicant_username: string
  role_type: BuildSheetRole
  preferences: BuildSheetPreferenceSnapshot[]
  status: 'pending' | 'assigned' | 'cancelled'
  assigned_party_number: number | null
  assigned_slot_id: string | null
  selected_template_id: string | null
  selected_snapshot: BuildSheetPreferenceSnapshot | null
  assigned_by: string | null
  assigned_at: string | null
  created_at: string
}

export interface BuildSheetRoleDemand {
  party_number: number
  role_type: BuildSheetRole
  required_count: number
}

export interface BuildSheetPartyAssigner {
  party_number: number
  caller_discord_id: string
}

export interface BuildSheetWeaponSummary {
  role_type: BuildSheetRole
  template_id: string
  weapon_name: string
  weapon_id: string
  priority_counts: [number, number, number]
  applicant_ids: string[]
}

export interface BuildSheetRoleSummary {
  role_type: BuildSheetRole
  required_count: number
  pending_count: number
  assigned_count: number
}

export function isBuildSheetRole(value: unknown): value is BuildSheetRole {
  return typeof value === 'string' && BUILD_SHEET_ROLES.includes(value as BuildSheetRole)
}

export function normalizeBuildSheetPreferenceIds(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    const trimmed = id.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
    if (out.length >= MAX_BUILD_SHEET_PREFERENCES) break
  }
  return out
}

export function getBuildEntryWeapon(data: Record<string, unknown>): {
  weapon_name: string | null
  weapon_id: string | null
} {
  const weaponName = typeof data.weapon_name === 'string' ? data.weapon_name.trim() : ''
  const weaponId = typeof data.weapon_id === 'string' ? data.weapon_id.trim() : ''
  return {
    weapon_name: weaponName || null,
    weapon_id: weaponId || null,
  }
}

export function parseBuildSheetPreferences(raw: unknown): BuildSheetPreferenceSnapshot[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item): BuildSheetPreferenceSnapshot | null => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      if (
        typeof row.template_id !== 'string' ||
        typeof row.template_name !== 'string' ||
        typeof row.weapon_name !== 'string' ||
        typeof row.weapon_id !== 'string' ||
        !isBuildSheetRole(row.role_type)
      ) {
        return null
      }
      const priority = typeof row.priority === 'number' ? row.priority : Number(row.priority)
      if (!Number.isInteger(priority) || priority < 1 || priority > MAX_BUILD_SHEET_PREFERENCES) {
        return null
      }
      const buildData = row.build_data && typeof row.build_data === 'object'
        ? row.build_data as Record<string, unknown>
        : {}
      return {
        template_id: row.template_id,
        template_name: row.template_name,
        role_type: row.role_type,
        weapon_name: row.weapon_name,
        weapon_id: row.weapon_id,
        priority,
        build_data: buildData,
      }
    })
    .filter((item): item is BuildSheetPreferenceSnapshot => item !== null)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_BUILD_SHEET_PREFERENCES)
}

export function summarizeBuildSheetWeapons(
  applications: readonly BuildSheetApplication[],
): BuildSheetWeaponSummary[] {
  const byKey = new Map<string, BuildSheetWeaponSummary>()
  for (const app of applications) {
    if (app.status === 'cancelled') continue
    for (const pref of app.preferences) {
      const key = `${app.role_type}:${pref.template_id}`
      const existing = byKey.get(key)
      const summary = existing ?? {
        role_type: app.role_type,
        template_id: pref.template_id,
        weapon_name: pref.weapon_name,
        weapon_id: pref.weapon_id,
        priority_counts: [0, 0, 0] as [number, number, number],
        applicant_ids: [],
      }
      const idx = pref.priority - 1
      summary.priority_counts[idx] += 1
      if (!summary.applicant_ids.includes(app.applicant_discord_id)) {
        summary.applicant_ids = [...summary.applicant_ids, app.applicant_discord_id]
      }
      byKey.set(key, summary)
    }
  }
  return Array.from(byKey.values()).sort((a, b) => {
    if (a.role_type !== b.role_type) {
      return BUILD_SHEET_ROLES.indexOf(a.role_type) - BUILD_SHEET_ROLES.indexOf(b.role_type)
    }
    return b.priority_counts[0] - a.priority_counts[0] || a.weapon_name.localeCompare(b.weapon_name)
  })
}

export function summarizeBuildSheetRoles(
  demands: readonly BuildSheetRoleDemand[],
  applications: readonly BuildSheetApplication[],
): BuildSheetRoleSummary[] {
  return BUILD_SHEET_ROLES.map((role) => {
    const required = demands
      .filter((d) => d.role_type === role)
      .reduce((sum, d) => sum + d.required_count, 0)
    const roleApps = applications.filter((app) => app.role_type === role)
    return {
      role_type: role,
      required_count: required,
      pending_count: roleApps.filter((app) => app.status === 'pending').length,
      assigned_count: roleApps.filter((app) => app.status === 'assigned').length,
    }
  })
}
