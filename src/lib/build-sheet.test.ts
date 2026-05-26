import { describe, expect, it } from 'vitest'
import {
  normalizeBuildSheetPreferenceIds,
  parseBuildSheetPreferences,
  summarizeBuildSheetRoles,
  summarizeBuildSheetWeapons,
  type BuildSheetApplication,
} from './build-sheet'

describe('build-sheet helpers', () => {
  it('dedupes and caps weapon preference ids', () => {
    expect(normalizeBuildSheetPreferenceIds([' a ', 'b', 'a', '', 'c', 'd'])).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('drops malformed preference snapshots', () => {
    const parsed = parseBuildSheetPreferences([
      {
        template_id: 'tpl-1',
        template_name: 'Fallen',
        role_type: 'Healer',
        weapon_name: 'Elder Fallen Staff',
        weapon_id: 'T8_MAIN_HOLYSTAFF',
        priority: 2,
        build_data: { weapon_id: 'T8_MAIN_HOLYSTAFF' },
      },
      { template_id: 'bad', role_type: 'Caller', priority: 1 },
    ])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].priority).toBe(2)
  })

  it('summarizes roles and weapon priorities for caller boards', () => {
    const apps: BuildSheetApplication[] = [
      {
        id: 'app-1',
        applicant_discord_id: 'u1',
        applicant_username: 'Alpha',
        role_type: 'Healer',
        preferences: [
          {
            template_id: 'fallen',
            template_name: 'Fallen',
            role_type: 'Healer',
            weapon_name: 'Fallen Staff',
            weapon_id: 'T8_MAIN_HOLYSTAFF',
            priority: 1,
            build_data: {},
          },
          {
            template_id: 'hallow',
            template_name: 'Hallowfall',
            role_type: 'Healer',
            weapon_name: 'Hallowfall',
            weapon_id: 'T8_2H_HOLYSTAFF_HELL',
            priority: 2,
            build_data: {},
          },
        ],
        status: 'pending',
        assigned_party_number: null,
        assigned_slot_id: null,
        selected_template_id: null,
        selected_snapshot: null,
        assigned_by: null,
        assigned_at: null,
        created_at: '2026-05-26T00:00:00.000Z',
      },
      {
        id: 'app-2',
        applicant_discord_id: 'u2',
        applicant_username: 'Beta',
        role_type: 'Healer',
        preferences: [
          {
            template_id: 'fallen',
            template_name: 'Fallen',
            role_type: 'Healer',
            weapon_name: 'Fallen Staff',
            weapon_id: 'T8_MAIN_HOLYSTAFF',
            priority: 1,
            build_data: {},
          },
        ],
        status: 'assigned',
        assigned_party_number: 1,
        assigned_slot_id: 'slot-1',
        selected_template_id: 'fallen',
        selected_snapshot: null,
        assigned_by: 'caller',
        assigned_at: '2026-05-26T00:01:00.000Z',
        created_at: '2026-05-26T00:00:00.000Z',
      },
    ]

    const roleSummary = summarizeBuildSheetRoles(
      [{ party_number: 1, role_type: 'Healer', required_count: 4 }],
      apps,
    )
    expect(roleSummary.find((role) => role.role_type === 'Healer')).toMatchObject({
      required_count: 4,
      pending_count: 1,
      assigned_count: 1,
    })

    const weaponSummary = summarizeBuildSheetWeapons(apps)
    expect(weaponSummary.find((weapon) => weapon.template_id === 'fallen')).toMatchObject({
      priority_counts: [2, 0, 0],
      applicant_ids: ['u1', 'u2'],
    })
  })
})
