import type {
  ConditionalSlotOptions,
  DependentSlotKey,
  GearOption,
  GearSpec,
  GearSpecs,
  SlotKey,
  SlotSpells,
} from '@/types'
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

  const specs: GearSpecs = {}
  for (const key of SLOT_KEYS) {
    const spec = slot.specs[key]
    if (!spec) continue
    const clean: GearSpec = {}
    if (typeof spec.tier === 'number') clean.tier = spec.tier
    if (typeof spec.enchant === 'number') clean.enchant = spec.enchant
    if (clean.tier != null || clean.enchant != null) specs[key] = clean
  }
  const specsOrNull = Object.keys(specs).length > 0 ? specs : null

  // Migration 139: conditional_options 도 템플릿에 함께 저장. 베이스 옵션이
  // 없는 종류 / 무기 ID 가 사라진 매핑은 drop 해 정합성을 맞춘다.
  const conditional = sanitizeConditionalForTemplate(
    slot.conditional_options ?? {},
    cleanedOptions,
  )

  return {
    role_name: slot.role_name.trim() || null,
    notes: slot.notes.trim() || null,
    spells: spellsOrNull,
    gear_specs: specsOrNull,
    conditional_options: conditional,
    weapon_name: fixedValue('weapon', 'name'),  weapon_id: fixedValue('weapon', 'id'),   weapon_options: cleanedOptions.weapon,
    head_name: fixedValue('head', 'name'),       head_id: fixedValue('head', 'id'),       head_options: cleanedOptions.head,
    armor_name: fixedValue('armor', 'name'),     armor_id: fixedValue('armor', 'id'),     armor_options: cleanedOptions.armor,
    shoes_name: fixedValue('shoes', 'name'),     shoes_id: fixedValue('shoes', 'id'),     shoes_options: cleanedOptions.shoes,
    offhand_name: fixedValue('offhand', 'name'), offhand_id: fixedValue('offhand', 'id'), offhand_options: cleanedOptions.offhand,
    potion_name: fixedValue('potion', 'name'),   potion_id: fixedValue('potion', 'id'),   potion_options: cleanedOptions.potion,
    food_name: fixedValue('food', 'name'),       food_id: fixedValue('food', 'id'),       food_options: cleanedOptions.food,
    cape_name: fixedValue('cape', 'name'),       cape_id: fixedValue('cape', 'id'),       cape_options: cleanedOptions.cape,
    mount_name: fixedValue('mount', 'name'),     mount_id: fixedValue('mount', 'id'),     mount_options: cleanedOptions.mount,
  }
}

// 템플릿용 conditional 정리 — admin.ts 의 sanitizeConditionalOptions 와 같은
// 규칙. 차이점은 입력이 빈 객체일 수 있고, 매핑이 없으면 null 반환.
function sanitizeConditionalForTemplate(
  raw: ConditionalSlotOptions,
  baseOptions: Record<SlotKey, GearOption[] | null>,
): ConditionalSlotOptions | null {
  const weaponBase = baseOptions.weapon ?? []
  if (weaponBase.length === 0) return null
  const weaponIds = new Set(weaponBase.map((o) => o.id))
  const out: ConditionalSlotOptions = {}
  for (const key of SLOT_KEYS) {
    if (key === 'weapon') continue
    const dependentBase = baseOptions[key]
    if (!Array.isArray(dependentBase) || dependentBase.length === 0) continue
    const baseIds = new Set(dependentBase.map((o) => o.id))
    const perWeapon = raw[key as DependentSlotKey]
    if (!perWeapon || typeof perWeapon !== 'object') continue
    const cleanPerWeapon: Record<string, GearOption[]> = {}
    for (const [weaponId, narrowed] of Object.entries(perWeapon)) {
      if (!weaponIds.has(weaponId) || !Array.isArray(narrowed)) continue
      const seen = new Set<string>()
      const cleaned: GearOption[] = []
      for (const opt of narrowed) {
        if (!opt || typeof opt.id !== 'string' || typeof opt.name !== 'string') continue
        if (!opt.id || !opt.name) continue
        if (!baseIds.has(opt.id) || seen.has(opt.id)) continue
        seen.add(opt.id)
        cleaned.push({ name: opt.name, id: opt.id })
      }
      if (cleaned.length > 0) cleanPerWeapon[weaponId] = cleaned
    }
    if (Object.keys(cleanPerWeapon).length > 0) {
      out[key as DependentSlotKey] = cleanPerWeapon
    }
  }
  return Object.keys(out).length > 0 ? out : null
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

  const specs = SLOT_KEYS.reduce(
    (acc, k) => ({ ...acc, [k]: { ...(data.gear_specs?.[k] ?? {}) } }),
    {} as Record<SlotKey, GearSpec>,
  )

  return {
    ...current,
    role_name: data.role_name ?? '',
    notes: data.notes ?? '',
    items,
    options: optionsRecord,
    spells,
    specs,
    conditional_options: data.conditional_options ?? {},
  }
}
