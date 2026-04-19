import { SLOT_KEYS, type SlotKey, type SlotSpells } from '@/types'
import type { SlotInput } from '@/components/SlotEditor'
import type { SlotTemplateData } from '@/app/actions/slot-templates'

// Converts the editor's nested SlotInput shape to the flat SlotTemplateData
// that the DB stores. Mirrors the slots table columns.
export function slotInputToTemplateData(slot: SlotInput): SlotTemplateData {
  const spells: SlotSpells = {}
  for (const key of SLOT_KEYS) {
    const list = slot.spells[key]
    if (Array.isArray(list) && list.length > 0) spells[key] = [...list]
  }
  const spellsOrNull = Object.keys(spells).length > 0 ? spells : null

  const weaponOptions =
    slot.weapon_options.length > 0
      ? slot.weapon_options.map((o) => ({ name: o.name, id: o.id }))
      : null

  // If multi-weapon is active the fixed weapon columns must be null, matching
  // the server-side slotToRow convention — otherwise a loaded template would
  // carry a stale fixed weapon alongside its options.
  const clearFixedWeapon = weaponOptions !== null

  const itemValue = (key: SlotKey, field: 'name' | 'id'): string | null => {
    if (key === 'weapon' && clearFixedWeapon) return null
    const value = slot.items[key][field]
    return value ? value : null
  }

  return {
    role_name: slot.role_name.trim() || null,
    notes: slot.notes.trim() || null,
    weapon_name: itemValue('weapon', 'name'),
    weapon_id: itemValue('weapon', 'id'),
    weapon_options: weaponOptions,
    head_name: itemValue('head', 'name'),   head_id: itemValue('head', 'id'),
    armor_name: itemValue('armor', 'name'), armor_id: itemValue('armor', 'id'),
    shoes_name: itemValue('shoes', 'name'), shoes_id: itemValue('shoes', 'id'),
    offhand_name: itemValue('offhand', 'name'), offhand_id: itemValue('offhand', 'id'),
    potion_name: itemValue('potion', 'name'),   potion_id: itemValue('potion', 'id'),
    food_name: itemValue('food', 'name'),       food_id: itemValue('food', 'id'),
    cape_name: itemValue('cape', 'name'),       cape_id: itemValue('cape', 'id'),
    spells: spellsOrNull,
  }
}

// Applies a loaded template over an existing SlotInput. Preserves slot_number
// and assigned_username — those belong to the slot's current position, not the
// template. The editor tree gets a fresh object so React picks up the change.
export function applyTemplateToSlotInput(
  current: SlotInput,
  data: SlotTemplateData,
): SlotInput {
  const items = SLOT_KEYS.reduce(
    (acc, k) => {
      if (k === 'weapon' && Array.isArray(data.weapon_options) && data.weapon_options.length > 0) {
        // Multi-weapon: the fixed weapon slot stays blank and the options
        // drive the picker. Keep items.weapon empty to match the editor's
        // deriveWeaponMode contract.
        return { ...acc, [k]: { name: '', id: '' } }
      }
      const name = data[`${k}_name`] ?? ''
      const id = data[`${k}_id`] ?? ''
      return { ...acc, [k]: { name, id } }
    },
    {} as Record<SlotKey, { name: string; id: string }>,
  )

  const spells = SLOT_KEYS.reduce(
    (acc, k) => ({ ...acc, [k]: [...(data.spells?.[k] ?? [])] }),
    {} as Record<SlotKey, string[]>,
  )

  const weaponOptions = Array.isArray(data.weapon_options)
    ? data.weapon_options.map((o) => ({ name: o.name, id: o.id }))
    : []

  return {
    ...current,
    role_name: data.role_name ?? '',
    notes: data.notes ?? '',
    items,
    weapon_options: weaponOptions,
    spells,
  }
}
