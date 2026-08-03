import type { SlotInput } from '@/components/SlotEditor/slot-input'
import type { GearSpec, SlotKey, SlotRole } from '@/types'
import { SLOT_KEYS, isFreeItem } from '@/types'

export type BatchApplyScope = 'all' | 'selected' | SlotRole
export type SlotDropEdge = 'before' | 'after'

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

// Split layout is based on the width that the workspace can actually use,
// rather than the browser viewport. The admin shell/sidebar can otherwise
// leave a nominally wide desktop with an editor narrower than its controls.
export const SLOT_WORKSPACE_INLINE_MIN_WIDTH = 1_040
export const SLOT_WORKSPACE_INLINE_MIN_VIEWPORT = SLOT_WORKSPACE_INLINE_MIN_WIDTH

export function shouldUseSlotWorkspaceOverlay(workspaceWidth: number): boolean {
  return workspaceWidth < SLOT_WORKSPACE_INLINE_MIN_WIDTH
}

export function batchScopeTelemetryValue(scope: BatchApplyScope): string {
  if (scope === '기타') return 'other'
  return scope.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
}

export function slotWorkspaceEditorMaxHeight({
  viewportHeight,
  editorTop,
  saveBarTop,
  topInset = 80,
  bottomGap = 16,
}: {
  viewportHeight: number
  editorTop: number
  saveBarTop?: number
  topInset?: number
  bottomGap?: number
}): number {
  // An editor can mount below the viewport inside the app shell's own scroll
  // region. That container does not emit a window scroll event, so returning
  // zero here would leave the sticky editor permanently collapsed even after
  // the user scrolls it into view. Use its eventual sticky inset until the
  // element is measured inside the viewport.
  const measuredEditorTop = editorTop >= viewportHeight ? topInset : editorTop
  const visibleTop = Math.max(topInset, measuredEditorTop)
  const resolvedSaveBarTop =
    typeof saveBarTop === 'number' && Number.isFinite(saveBarTop) && saveBarTop > visibleTop
      ? saveBarTop
      : viewportHeight
  const visibleBottom = Math.min(viewportHeight, resolvedSaveBarTop)
  return Math.max(0, Math.floor(visibleBottom - visibleTop - bottomGap))
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

export function moveSlotByDrop(
  slots: readonly SlotInput[],
  sourceId: string,
  targetId: string,
  edge: SlotDropEdge,
): SlotInput[] {
  if (sourceId === targetId) return [...slots]
  const sourceIndex = slots.findIndex((slot) => getSlotWorkspaceId(slot) === sourceId)
  const targetIndex = slots.findIndex((slot) => getSlotWorkspaceId(slot) === targetId)
  if (sourceIndex < 0 || targetIndex < 0) return [...slots]

  const moving = slots[sourceIndex]
  const withoutMoving = slots.filter((_, index) => index !== sourceIndex)
  const remainingTargetIndex = withoutMoving.findIndex(
    (slot) => getSlotWorkspaceId(slot) === targetId,
  )
  if (remainingTargetIndex < 0) return [...slots]
  const insertionIndex = edge === 'after' ? remainingTargetIndex + 1 : remainingTargetIndex

  return renumberSlots([
    ...withoutMoving.slice(0, insertionIndex),
    moving,
    ...withoutMoving.slice(insertionIndex),
  ])
}

export function dragAutoScrollDelta(
  pointerY: number,
  viewportHeight: number,
  edgeThreshold = 96,
  speed = 16,
): number {
  if (
    !Number.isFinite(pointerY) ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0 ||
    pointerY < 0 ||
    pointerY > viewportHeight
  ) {
    return 0
  }
  if (pointerY < edgeThreshold) return -speed
  if (pointerY > viewportHeight - edgeThreshold) return speed
  return 0
}

export function deleteSlotAt(slots: readonly SlotInput[], index: number): SlotInput[] {
  if (index < 0 || index >= slots.length) return [...slots]
  return renumberSlots(slots.filter((_, currentIndex) => currentIndex !== index))
}

export function deleteSelectedSlots(
  slots: readonly SlotInput[],
  selectedIds: readonly string[],
): SlotInput[] {
  const selected = new Set(selectedIds)
  return renumberSlots(slots.filter((slot) => !selected.has(getSlotWorkspaceId(slot))))
}

export function setSelectedSlotsHidden(
  slots: readonly SlotInput[],
  selectedIds: readonly string[],
  hidden: boolean,
): SlotInput[] {
  const selected = new Set(selectedIds)
  return slots.map((slot) => selected.has(getSlotWorkspaceId(slot))
    ? { ...slot, is_hidden: hidden }
    : slot)
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

export function duplicateSelectedSlots(
  slots: readonly SlotInput[],
  selectedIds: readonly string[],
  createId: () => string,
): SlotInput[] {
  if (slots.length >= 20 || selectedIds.length === 0) return [...slots]
  const selected = new Set(selectedIds)
  const next: SlotInput[] = []
  let remainingCopies = 20 - slots.length

  for (const slot of slots) {
    next.push(slot)
    if (remainingCopies <= 0 || !selected.has(getSlotWorkspaceId(slot))) continue
    next.push({
      ...cloneSlotInput(slot),
      id: createId(),
      assigned_username: null,
    })
    remainingCopies -= 1
  }

  return renumberSlots(next)
}

export interface UndoAfterEditResolution<T> {
  receipt: T | null
  checkpointPending: boolean
  invalidated: boolean
}

export function resolveUndoAfterSlotEdit<T>(
  receipt: T | null,
  checkpointPending: boolean,
): UndoAfterEditResolution<T> {
  if (checkpointPending) {
    return { receipt, checkpointPending: false, invalidated: false }
  }
  if (receipt) {
    return { receipt: null, checkpointPending: false, invalidated: true }
  }
  return { receipt: null, checkpointPending: false, invalidated: false }
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

export function previewResetBatchSpecs(
  slots: readonly SlotInput[],
  scope: BatchApplyScope,
  selectedIds: readonly string[],
): BatchSpecsPreview {
  let targetSlots = 0
  let changedSlots = 0
  let changedFields = 0

  for (const slot of slots) {
    if (!isInScope(slot, scope, selectedIds)) continue
    targetSlots += 1
    const slotChangedFields = SLOT_KEYS.reduce((count, key) => {
      const spec = slot.specs[key] ?? {}
      return count + Number(spec.tier != null) + Number(spec.enchant != null)
    }, 0)
    if (slotChangedFields > 0) changedSlots += 1
    changedFields += slotChangedFields
  }

  return { targetSlots, changedSlots, changedFields }
}

export function resetBatchSpecs(
  slots: readonly SlotInput[],
  scope: BatchApplyScope,
  selectedIds: readonly string[],
): SlotInput[] {
  return slots.map((slot) => {
    if (!isInScope(slot, scope, selectedIds)) return slot
    const hasSpecs = SLOT_KEYS.some((key) => {
      const spec = slot.specs[key] ?? {}
      return spec.tier != null || spec.enchant != null
    })
    if (!hasSpecs) return slot

    return {
      ...slot,
      specs: SLOT_KEYS.reduce(
        (next, key) => ({ ...next, [key]: {} }),
        {} as SlotInput['specs'],
      ),
    }
  })
}
