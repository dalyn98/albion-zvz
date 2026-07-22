import type { SlotInput } from '@/components/SlotEditor/slot-input'
import type { GearSpec, SlotKey, SlotRole } from '@/types'
import { SLOT_KEYS, isFreeItem } from '@/types'

export type BatchApplyScope = 'all' | 'selected' | SlotRole

export interface BatchItemPicks {
  potion: { name: string; id: string } | null
  mount: { name: string; id: string } | null
}

export interface BatchItemsPreview {
  targetSlots: number
  changedSlots: number
  changedFields: number
  overwrittenFields: number
  skippedOptionSlots: number
}

export interface BatchSpecsPreview {
  targetSlots: number
  changedSlots: number
  changedFields: number
}

export function getSlotWorkspaceId(slot: SlotInput): string {
  return slot.id ?? `slot-${slot.slot_number}`
}

export function countConfiguredSlotKinds(slot: SlotInput): number {
  return SLOT_KEYS.reduce((count, key) => {
    if (slot.options[key].length > 0) return count + 1
    const item = slot.items[key]
    return item.id || isFreeItem(item.name, item.id) ? count + 1 : count
  }, 0)
}

export function renumberSlots(slots: readonly SlotInput[]): SlotInput[] {
  return slots.map((slot, index) => {
    const slotNumber = index + 1
    return slot.slot_number === slotNumber ? slot : { ...slot, slot_number: slotNumber }
  })
}

export function moveSlotAt(
  slots: readonly SlotInput[],
  index: number,
  direction: -1 | 1,
): SlotInput[] {
  const target = index + direction
  if (index < 0 || index >= slots.length || target < 0 || target >= slots.length) {
    return [...slots]
  }
  return renumberSlots(slots.map((slot, currentIndex) => {
    if (currentIndex === index) return slots[target]
    if (currentIndex === target) return slots[index]
    return slot
  }))
}

export function moveSlotTo(
  slots: readonly SlotInput[],
  fromIndex: number,
  toIndex: number,
): SlotInput[] {
  if (
    fromIndex < 0 ||
    fromIndex >= slots.length ||
    toIndex < 0 ||
    toIndex >= slots.length ||
    fromIndex === toIndex
  ) {
    return [...slots]
  }
  const moving = slots[fromIndex]
  const withoutMoving = slots.filter((_, index) => index !== fromIndex)
  return renumberSlots([
    ...withoutMoving.slice(0, toIndex),
    moving,
    ...withoutMoving.slice(toIndex),
  ])
}

export function deleteSlotAt(slots: readonly SlotInput[], index: number): SlotInput[] {
  if (index < 0 || index >= slots.length) return [...slots]
  return renumberSlots(slots.filter((_, currentIndex) => currentIndex !== index))
}

export function cloneSlotInput(slot: SlotInput): SlotInput {
  const items = SLOT_KEYS.reduce(
    (next, key) => ({ ...next, [key]: { ...slot.items[key] } }),
    {} as SlotInput['items'],
  )
  const options = SLOT_KEYS.reduce(
    (next, key) => ({
      ...next,
      [key]: slot.options[key].map((option) => ({
        ...option,
        spells: option.spells ? [...option.spells] : undefined,
      })),
    }),
    {} as SlotInput['options'],
  )
  const spells = SLOT_KEYS.reduce(
    (next, key) => ({ ...next, [key]: [...slot.spells[key]] }),
    {} as SlotInput['spells'],
  )
  const specs = SLOT_KEYS.reduce(
    (next, key) => ({ ...next, [key]: { ...slot.specs[key] } }),
    {} as SlotInput['specs'],
  )
  const conditionalOptions = Object.fromEntries(
    Object.entries(slot.conditional_options).map(([key, mappings]) => [
      key,
      Object.fromEntries(
        Object.entries(mappings ?? {}).map(([weaponId, candidates]) => [
          weaponId,
          candidates.map((candidate) => ({ ...candidate })),
        ]),
      ),
    ]),
  ) as SlotInput['conditional_options']

  return {
    ...slot,
    items,
    options,
    spells,
    specs,
    conditional_options: conditionalOptions,
  }
}

export function duplicateSlotAt(
  slots: readonly SlotInput[],
  index: number,
  nextId: string,
): SlotInput[] {
  const source = slots[index]
  if (!source || slots.length >= 20) return [...slots]
  const duplicate = {
    ...cloneSlotInput(source),
    id: nextId,
    slot_number: index + 2,
    assigned_username: null,
  }
  return renumberSlots([
    ...slots.slice(0, index + 1),
    duplicate,
    ...slots.slice(index + 1),
  ])
}

function isInScope(
  slot: SlotInput,
  scope: BatchApplyScope,
  selectedIds: readonly string[],
): boolean {
  if (scope === 'all') return true
  if (scope === 'selected') return selectedIds.includes(getSlotWorkspaceId(slot))
  return slot.role_name === scope
}

function selectedBatchItemKeys(picks: BatchItemPicks): Array<'potion' | 'mount'> {
  return (['potion', 'mount'] as const).filter((key) => picks[key] !== null)
}

export function previewBatchItems(
  slots: readonly SlotInput[],
  picks: BatchItemPicks,
  scope: BatchApplyScope,
  selectedIds: readonly string[],
): BatchItemsPreview {
  const keys = selectedBatchItemKeys(picks)
  let targetSlots = 0
  let changedSlots = 0
  let changedFields = 0
  let overwrittenFields = 0
  let skippedOptionSlots = 0

  for (const slot of slots) {
    if (!isInScope(slot, scope, selectedIds)) continue
    targetSlots += 1
    let slotChanged = false
    let skippedOption = false
    for (const key of keys) {
      const pick = picks[key]
      if (!pick) continue
      if (slot.options[key].length > 0) {
        skippedOption = true
        continue
      }
      const current = slot.items[key]
      if (current.id === pick.id && current.name === pick.name) continue
      changedFields += 1
      slotChanged = true
      if (current.id || current.name) overwrittenFields += 1
    }
    if (slotChanged) changedSlots += 1
    if (skippedOption) skippedOptionSlots += 1
  }

  return { targetSlots, changedSlots, changedFields, overwrittenFields, skippedOptionSlots }
}

export function applyBatchItems(
  slots: readonly SlotInput[],
  picks: BatchItemPicks,
  scope: BatchApplyScope,
  selectedIds: readonly string[],
): SlotInput[] {
  const keys = selectedBatchItemKeys(picks)
  return slots.map((slot) => {
    if (!isInScope(slot, scope, selectedIds)) return slot
    let changed = false
    const nextItems = { ...slot.items }
    for (const key of keys) {
      const pick = picks[key]
      if (!pick || slot.options[key].length > 0) continue
      const current = slot.items[key]
      if (current.id === pick.id && current.name === pick.name) continue
      nextItems[key] = { ...pick }
      changed = true
    }
    return changed ? { ...slot, items: nextItems } : slot
  })
}

function mergeMissingSpec(current: GearSpec, incoming: GearSpec): {
  next: GearSpec
  changedFields: number
} {
  const next = { ...current }
  let changedFields = 0
  if (incoming.tier != null && next.tier == null) {
    next.tier = incoming.tier
    changedFields += 1
  }
  if (incoming.enchant != null && next.enchant == null) {
    next.enchant = incoming.enchant
    changedFields += 1
  }
  return { next, changedFields }
}

export function previewBatchSpecs(
  slots: readonly SlotInput[],
  incoming: Partial<Record<SlotKey, GearSpec>>,
  scope: BatchApplyScope,
  selectedIds: readonly string[],
): BatchSpecsPreview {
  let targetSlots = 0
  let changedSlots = 0
  let changedFields = 0
  for (const slot of slots) {
    if (!isInScope(slot, scope, selectedIds)) continue
    targetSlots += 1
    let slotChangedFields = 0
    for (const key of SLOT_KEYS) {
      const patch = incoming[key]
      if (!patch) continue
      slotChangedFields += mergeMissingSpec(slot.specs[key] ?? {}, patch).changedFields
    }
    if (slotChangedFields > 0) changedSlots += 1
    changedFields += slotChangedFields
  }
  return { targetSlots, changedSlots, changedFields }
}

export function applyBatchSpecs(
  slots: readonly SlotInput[],
  incoming: Partial<Record<SlotKey, GearSpec>>,
  scope: BatchApplyScope,
  selectedIds: readonly string[],
): SlotInput[] {
  return slots.map((slot) => {
    if (!isInScope(slot, scope, selectedIds)) return slot
    let changed = false
    const nextSpecs = { ...slot.specs }
    for (const key of SLOT_KEYS) {
      const patch = incoming[key]
      if (!patch) continue
      const merged = mergeMissingSpec(slot.specs[key] ?? {}, patch)
      if (merged.changedFields === 0) continue
      nextSpecs[key] = merged.next
      changed = true
    }
    return changed ? { ...slot, specs: nextSpecs } : slot
  })
}
