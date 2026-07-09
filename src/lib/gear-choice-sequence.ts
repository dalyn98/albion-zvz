import type { ConditionalSlotOptions, DependentSlotKey, SlotKey } from '@/types'

export type GearChoicePickState = Partial<Record<SlotKey, string>>

interface ConditionalSlotLike {
  conditional_options: ConditionalSlotOptions | null
}

function isDependentSlotKey(key: SlotKey): key is DependentSlotKey {
  return key !== 'weapon'
}

export function hasSequentialGearChoices(
  slot: ConditionalSlotLike,
  kinds: readonly SlotKey[],
): boolean {
  if (!kinds.includes('weapon')) return false
  return kinds.some((kind) => (
    isDependentSlotKey(kind) && !!slot.conditional_options?.[kind]
  ))
}

export function getFirstMissingGearChoiceKind(
  kinds: readonly SlotKey[],
  picks: GearChoicePickState,
): SlotKey | null {
  return kinds.find((kind) => !picks[kind]) ?? null
}

export function isGearChoiceKindLocked(
  slot: ConditionalSlotLike,
  kinds: readonly SlotKey[],
  picks: GearChoicePickState,
  kind: SlotKey,
): boolean {
  if (!hasSequentialGearChoices(slot, kinds)) return false
  const firstMissing = getFirstMissingGearChoiceKind(kinds, picks)
  if (!firstMissing) return false
  return kinds.indexOf(kind) > kinds.indexOf(firstMissing)
}

export function applyGearChoicePick({
  picks,
  kinds,
  kind,
  optionId,
  sequential,
}: {
  picks: GearChoicePickState
  kinds: readonly SlotKey[]
  kind: SlotKey
  optionId: string
  sequential: boolean
}): GearChoicePickState {
  const next: GearChoicePickState = { ...picks, [kind]: optionId }
  if (!sequential) return next

  const selectedIndex = kinds.indexOf(kind)
  if (selectedIndex < 0) return next
  for (const laterKind of kinds.slice(selectedIndex + 1)) {
    delete next[laterKind]
  }
  return next
}
