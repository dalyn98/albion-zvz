import type { GearSpec, SlotKey } from '@/types'
import { isTierlessSlot } from '@/types'

export const BATCH_SPEC_KEYS = [
  'weapon',
  'offhand',
  'head',
  'armor',
  'shoes',
  'cape',
  'food',
  'potion',
] as const satisfies readonly SlotKey[]

export type BatchSpecKey = (typeof BATCH_SPEC_KEYS)[number]
export type BatchGroupSpecs = Record<BatchSpecKey, GearSpec>

export function expandBatchGroupSpecs(
  groupSpecs: BatchGroupSpecs,
): Partial<Record<SlotKey, GearSpec>> {
  const expanded: Partial<Record<SlotKey, GearSpec>> = {}

  for (const key of BATCH_SPEC_KEYS) {
    const groupSpec = groupSpecs[key]
    const hasTier = !isTierlessSlot(key) && groupSpec.tier != null
    const hasEnchant = groupSpec.enchant != null
    if (!hasTier && !hasEnchant) continue

    expanded[key] = {
      ...(hasTier ? { tier: groupSpec.tier } : {}),
      ...(hasEnchant ? { enchant: groupSpec.enchant } : {}),
    }
  }

  return expanded
}
