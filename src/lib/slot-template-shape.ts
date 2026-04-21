import type { GearOption, SlotKey, SlotSpells } from '@/types'
import { SLOT_KEYS } from '@/types'
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

  const cleanedOptions = SLOT_KEYS.reduce(
    (acc, k) => {
      const opts = slot.options[k]
      const nonEmpty = Array.isArray(opts) && opts.length > 0
      acc[k] = nonEmpty
        ? opts.map((o) => {
            // 옵션별 스킬은 multi 모드의 일급 편집 상태. 템플릿 저장/로드에서
            // 잃어버리면 편집기에서 재복원이 불가능하므로 그대로 보존한다.
            const spells = Array.isArray(o.spells) && o.spells.length > 0 ? [...o.spells] : undefined
            return spells ? { name: o.name, id: o.id, spells } : { name: o.name, id: o.id }
          })
        : null
      return acc
    },
    {} as Record<SlotKey, GearOption[] | null>,
  )

  // When multi-option is active for a slot, its fixed name/id columns must be
  // null, matching the server-side slotToRow convention — otherwise a loaded
  // template would carry a stale fixed item alongside its options.
  const fixedValue = (key: SlotKey, field: 'name' | 'id'): string | null => {
    if (cleanedOptions[key] !== null) return null
    const value = slot.items[key][field]
    return value ? value : null
  }

  return {
    role_name: slot.role_name.trim() || null,
    notes: slot.notes.trim() || null,
    spells: spellsOrNull,
    weapon_name: fixedValue('weapon', 'name'),  weapon_id: fixedValue('weapon', 'id'),   weapon_options: cleanedOptions.weapon,
    head_name: fixedValue('head', 'name'),       head_id: fixedValue('head', 'id'),       head_options: cleanedOptions.head,
    armor_name: fixedValue('armor', 'name'),     armor_id: fixedValue('armor', 'id'),     armor_options: cleanedOptions.armor,
    shoes_name: fixedValue('shoes', 'name'),     shoes_id: fixedValue('shoes', 'id'),     shoes_options: cleanedOptions.shoes,
    offhand_name: fixedValue('offhand', 'name'), offhand_id: fixedValue('offhand', 'id'), offhand_options: cleanedOptions.offhand,
    potion_name: fixedValue('potion', 'name'),   potion_id: fixedValue('potion', 'id'),   potion_options: cleanedOptions.potion,
    food_name: fixedValue('food', 'name'),       food_id: fixedValue('food', 'id'),       food_options: cleanedOptions.food,
    cape_name: fixedValue('cape', 'name'),       cape_id: fixedValue('cape', 'id'),       cape_options: cleanedOptions.cape,
  }
}

// Applies a loaded template over an existing SlotInput. Preserves slot_number
// and assigned_username — those belong to the slot's current position, not the
// template. The editor tree gets a fresh object so React picks up the change.
export function applyTemplateToSlotInput(
  current: SlotInput,
  data: SlotTemplateData,
): SlotInput {
  const optionsRecord = SLOT_KEYS.reduce(
    (acc, k) => {
      const opts = data[`${k}_options`]
      acc[k] = Array.isArray(opts)
        ? opts.map((o) => {
            const spells = Array.isArray(o.spells) && o.spells.length > 0 ? [...o.spells] : undefined
            return spells ? { name: o.name, id: o.id, spells } : { name: o.name, id: o.id }
          })
        : []
      return acc
    },
    {} as Record<SlotKey, GearOption[]>,
  )

  const items = SLOT_KEYS.reduce(
    (acc, k) => {
      // If this slot has options, the fixed item should stay blank — mirrors
      // the save path's clearFixed convention.
      if (optionsRecord[k].length > 0) {
        return { ...acc, [k]: { name: '', id: '' } }
      }
      return {
        ...acc,
        [k]: { name: data[`${k}_name`] ?? '', id: data[`${k}_id`] ?? '' },
      }
    },
    {} as Record<SlotKey, { name: string; id: string }>,
  )

  const spells = SLOT_KEYS.reduce(
    (acc, k) => ({ ...acc, [k]: [...(data.spells?.[k] ?? [])] }),
    {} as Record<SlotKey, string[]>,
  )

  return {
    ...current,
    role_name: data.role_name ?? '',
    notes: data.notes ?? '',
    items,
    options: optionsRecord,
    spells,
  }
}
