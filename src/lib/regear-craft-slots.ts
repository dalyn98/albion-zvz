import type { SlotKey } from '@/types'

export const CORE_CRAFT_REGEAR_SLOTS = [
  'weapon',
  'head',
  'armor',
  'shoes',
  'offhand',
] as const satisfies readonly SlotKey[]

export const CRAFT_REGEAR_SLOTS_WITH_CAPE = [
  ...CORE_CRAFT_REGEAR_SLOTS,
  'cape',
] as const satisfies readonly SlotKey[]

export type CraftRegearSlot = (typeof CRAFT_REGEAR_SLOTS_WITH_CAPE)[number]

const CRAFT_SLOT_SET: ReadonlySet<string> = new Set(CRAFT_REGEAR_SLOTS_WITH_CAPE)

export function craftRegearSlots(includeCape: boolean): CraftRegearSlot[] {
  return includeCape ? [...CRAFT_REGEAR_SLOTS_WITH_CAPE] : [...CORE_CRAFT_REGEAR_SLOTS]
}

export function craftRegearSlotsIncludeCape(
  slots: readonly string[] | null | undefined,
): boolean {
  return Array.isArray(slots) && slots.includes('cape')
}

export function normalizeCraftRegearSlots(
  raw: unknown,
  fallbackIncludeCape = false,
): CraftRegearSlot[] {
  if (!Array.isArray(raw)) return craftRegearSlots(fallbackIncludeCape)

  const allowed = new Set<string>()
  for (const value of raw) {
    if (typeof value === 'string' && CRAFT_SLOT_SET.has(value)) {
      allowed.add(value)
    }
  }
  if (allowed.size === 0) return craftRegearSlots(fallbackIncludeCape)

  return CRAFT_REGEAR_SLOTS_WITH_CAPE.filter((slot) =>
    allowed.has(slot),
  ) as CraftRegearSlot[]
}

export function parseCraftIncludeCapeFormValue(value: FormDataEntryValue | null): boolean {
  return value === 'true' || value === '1' || value === 'on'
}

export function parseBooleanSetting(raw: string, fallback = false): boolean {
  if (raw === 'true') return true
  if (raw === 'false') return false
  return fallback
}
