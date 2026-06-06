import type { BuildSnapshot, GearSnapshotItem } from '@/types'
import {
  CRAFT_REGEAR_SLOTS_WITH_CAPE,
  type CraftRegearSlot,
} from './regear-craft-slots'

export interface CraftSlotDisplayEntry {
  slot: CraftRegearSlot
  item: GearSnapshotItem
}

export function getCraftSlotDisplayEntries(
  snapshot: BuildSnapshot | null,
  includedSlots: readonly CraftRegearSlot[] = CRAFT_REGEAR_SLOTS_WITH_CAPE,
): CraftSlotDisplayEntry[] {
  if (!snapshot) return []
  return includedSlots.flatMap((slot) => {
    const item = snapshot[slot]
    return item ? [{ slot, item }] : []
  })
}
