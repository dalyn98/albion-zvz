import type { TemplateData } from './templates'
import type { SlotTemplateData } from './slot-templates'
import {
  sanitizeConditionalOptions,
  sanitizeFixedGearItem,
  sanitizeGearOptions,
  sanitizeGearSpecs,
  sanitizeSpells,
} from './admin-slot-sanitizers'
import type {
  ConditionalSlotOptions,
  GearOption,
  GearSpecs,
  SlotKey,
  SlotSpells,
} from '@/types'
import { SLOT_KEYS } from '@/types'

const MAX_SLOTS_PER_TEMPLATE_PARTY = 20

type TemplateGearFields =
  & { [K in SlotKey as `${K}_options`]?: GearOption[] | null }
  & { [K in SlotKey as `${K}_name`]?: string | null }
  & { [K in SlotKey as `${K}_id`]?: string | null }

type SanitizableTemplateSlot = {
  role_name: string | null
  notes: string | null
  spells: SlotSpells | null
  gear_specs?: GearSpecs | null
  conditional_options?: ConditionalSlotOptions | null
} & TemplateGearFields

function textOrNull(value: string | null | undefined): string | null {
  return typeof value === 'string' ? value.trim() || null : null
}

function positiveIntegerOrFallback(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function sanitizeTemplateSlot<T extends SanitizableTemplateSlot>(slot: T): T {
  const cleanedOptions = SLOT_KEYS.reduce(
    (acc, key) => ({ ...acc, [key]: sanitizeGearOptions(slot[`${key}_options`]) }),
    {} as Record<SlotKey, GearOption[] | null>,
  )
  const cleanedGearColumns = SLOT_KEYS.reduce((acc, key) => {
    const hasOptions = cleanedOptions[key] !== null
    const fixedItem = sanitizeFixedGearItem({
      name: slot[`${key}_name`],
      id: slot[`${key}_id`],
    })
    return {
      ...acc,
      [`${key}_options`]: cleanedOptions[key],
      [`${key}_name`]: hasOptions ? null : fixedItem.name,
      [`${key}_id`]: hasOptions ? null : fixedItem.id,
    }
  }, {} as TemplateGearFields)

  return {
    ...slot,
    role_name: textOrNull(slot.role_name),
    notes: textOrNull(slot.notes),
    spells: sanitizeSpells(slot.spells),
    gear_specs: sanitizeGearSpecs(slot.gear_specs),
    conditional_options: sanitizeConditionalOptions(slot.conditional_options, cleanedOptions),
    ...cleanedGearColumns,
  }
}

export function sanitizeSlotTemplateData(data: SlotTemplateData): SlotTemplateData {
  return sanitizeTemplateSlot(data)
}

export function sanitizeTemplateData(data: TemplateData | null | undefined): TemplateData {
  return {
    parties: Array.isArray(data?.parties)
      ? data.parties.flatMap((party, partyIndex) => {
          if (!party || typeof party !== 'object') return []
          const slots = Array.isArray(party.slots)
            ? party.slots
                .slice(0, MAX_SLOTS_PER_TEMPLATE_PARTY)
                .flatMap((slot, slotIndex) => {
                  if (!slot || typeof slot !== 'object') return []
                  return [{
                    ...sanitizeTemplateSlot(slot),
                    slot_number: slotIndex + 1,
                  }]
                })
            : []
          return [{
            party_number: positiveIntegerOrFallback(party.party_number, partyIndex + 1),
            slots,
          }]
        })
      : [],
  }
}
