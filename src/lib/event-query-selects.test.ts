import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  EVENT_ROW_SELECT,
  PARTY_ROW_SELECT,
  PARTY_WITH_SLOTS_SELECT,
  SLOT_ROW_SELECT,
} from './event-query-selects'

const EVENT_LOADER_FILES = [
  'src/app/(app-shell)/events/[id]/page.tsx',
  'src/app/(app-shell)/events/[id]/party/[partyNumber]/page.tsx',
  'src/app/(app-shell)/admin/dashboard/events/[id]/page.tsx',
]

describe('event query projections', () => {
  it('covers every slot field required by event grid and slot editor rendering', () => {
    for (const field of [
      'id',
      'party_id',
      'slot_number',
      'is_hidden',
      'role_name',
      'notes',
      'weapon_name',
      'weapon_id',
      'head_name',
      'head_id',
      'armor_name',
      'armor_id',
      'shoes_name',
      'shoes_id',
      'offhand_name',
      'offhand_id',
      'potion_name',
      'potion_id',
      'food_name',
      'food_id',
      'cape_name',
      'cape_id',
      'mount_name',
      'mount_id',
      'weapon_options',
      'head_options',
      'armor_options',
      'shoes_options',
      'offhand_options',
      'potion_options',
      'food_options',
      'cape_options',
      'mount_options',
      'spells',
      'gear_specs',
      'auto_regear_excluded',
      'manual_regear_excluded',
      'assigned_discord_id',
      'assigned_username',
      'assigned_weapon_name',
      'assigned_weapon_id',
      'assigned_head_name',
      'assigned_head_id',
      'assigned_armor_name',
      'assigned_armor_id',
      'assigned_shoes_name',
      'assigned_shoes_id',
      'assigned_offhand_name',
      'assigned_offhand_id',
      'assigned_potion_name',
      'assigned_potion_id',
      'assigned_food_name',
      'assigned_food_id',
      'assigned_cape_name',
      'assigned_cape_id',
      'assigned_mount_name',
      'assigned_mount_id',
      'requested_discord_id',
      'requested_username',
      'requested_picks',
      'requested_at',
      'is_solo_bomb',
      'conditional_options',
    ]) {
      expect(SLOT_ROW_SELECT).toContain(field)
    }
  })

  it('keeps event and party row selects explicit', () => {
    expect(EVENT_ROW_SELECT).not.toContain('*')
    expect(PARTY_ROW_SELECT).not.toContain('*')
    expect(SLOT_ROW_SELECT).not.toContain('*')
    expect(PARTY_WITH_SLOTS_SELECT).toContain(`slots(${SLOT_ROW_SELECT})`)
    expect(PARTY_ROW_SELECT).toContain('slots_version')
    expect(EVENT_ROW_SELECT).toContain('tentative_snapshot_version_id')
    expect(EVENT_ROW_SELECT).toContain('tentative_snapshotted_at')
  })

  it('keeps event page loaders away from wildcard slot projections', () => {
    for (const filePath of EVENT_LOADER_FILES) {
      const source = readFileSync(filePath, 'utf8')
      expect(source, filePath).not.toMatch(/select\(['"`]\*['"`]\)/)
      expect(source, filePath).not.toContain('slots(*)')
    }
  })
})
