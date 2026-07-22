import { describe, expect, it } from 'vitest'
import { emptySlotInput } from '@/components/SlotEditor/slot-input'
import type { PartyWithSlots, Slot } from '@/types'
import { mergeEventPartyDrafts } from './event-roster-draft'

function persistedSlot(id: string, slotNumber: number, assignedDiscordId: string | null): Slot {
  return {
    id,
    party_id: 'party-1',
    slot_number: slotNumber,
    is_hidden: false,
    role_name: null,
    notes: null,
    weapon_name: null,
    weapon_id: null,
    head_name: null,
    head_id: null,
    armor_name: null,
    armor_id: null,
    shoes_name: null,
    shoes_id: null,
    offhand_name: null,
    offhand_id: null,
    potion_name: null,
    potion_id: null,
    food_name: null,
    food_id: null,
    cape_name: null,
    cape_id: null,
    mount_name: null,
    mount_id: null,
    weapon_options: null,
    head_options: null,
    armor_options: null,
    shoes_options: null,
    offhand_options: null,
    potion_options: null,
    food_options: null,
    cape_options: null,
    mount_options: null,
    spells: null,
    gear_specs: null,
    auto_regear_excluded: false,
    manual_regear_excluded: false,
    assigned_discord_id: assignedDiscordId,
    assigned_username: assignedDiscordId ? 'Assigned member' : null,
    assigned_weapon_name: null,
    assigned_weapon_id: null,
    assigned_head_name: null,
    assigned_head_id: null,
    assigned_armor_name: null,
    assigned_armor_id: null,
    assigned_shoes_name: null,
    assigned_shoes_id: null,
    assigned_offhand_name: null,
    assigned_offhand_id: null,
    assigned_potion_name: null,
    assigned_potion_id: null,
    assigned_food_name: null,
    assigned_food_id: null,
    assigned_cape_name: null,
    assigned_cape_id: null,
    assigned_mount_name: null,
    assigned_mount_id: null,
    requested_discord_id: null,
    requested_username: null,
    requested_picks: null,
    requested_at: null,
    is_solo_bomb: false,
    conditional_options: null,
  }
}

describe('event roster live draft', () => {
  it('uses draft layout while preserving assignment data for surviving slots', () => {
    const initial: PartyWithSlots[] = [{
      id: 'party-1',
      event_id: 'event-1',
      party_number: 1,
      slots_version: 2,
      name: null,
      is_bomb_squad: false,
      bomb_squad_kind: null,
      caller_discord_id: null,
      slots: [persistedSlot('slot-1', 1, 'member-1'), persistedSlot('slot-2', 2, null)],
    }]
    const surviving = emptySlotInput(1)
    surviving.id = 'slot-1'
    surviving.role_name = 'Defensive Tank'
    surviving.items.weapon = { name: 'Mace', id: 'T8_MAIN_MACE' }

    const merged = mergeEventPartyDrafts(initial, [{
      partyNumber: 1,
      slots: [surviving],
      name: 'Live bomb party',
      isBombSquad: true,
      bombSquadKind: 'melee',
      callerDiscordId: 'caller-1',
    }], 'event-1')

    expect(merged[0].slots).toHaveLength(1)
    expect(merged[0].slots[0]).toMatchObject({
      id: 'slot-1',
      slot_number: 1,
      role_name: 'Defensive Tank',
      weapon_id: 'T8_MAIN_MACE',
      assigned_discord_id: 'member-1',
    })
    expect(merged[0]).toMatchObject({
      name: 'Live bomb party',
      is_bomb_squad: true,
      bomb_squad_kind: 'melee',
      caller_discord_id: 'caller-1',
    })
  })
})
