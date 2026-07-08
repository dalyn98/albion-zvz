import type { DependentSlotKey, GearOption, SlotKey } from '@/types'

// Weapon is the only condition driver. Every key here can be narrowed after the
// member chooses one of the weapon options; food, potion, and cape are first
// class dependents, not special cases.
export const CONDITIONAL_DEPENDENT_SLOT_KEYS = [
  'head',
  'armor',
  'shoes',
  'offhand',
  'potion',
  'food',
  'cape',
  'mount',
] as const satisfies readonly DependentSlotKey[]

export function getConditionalDependentKinds(
  dependentOptions: Record<SlotKey, readonly GearOption[]>,
): DependentSlotKey[] {
  return CONDITIONAL_DEPENDENT_SLOT_KEYS.filter(
    (key) => dependentOptions[key].length > 0,
  )
}
