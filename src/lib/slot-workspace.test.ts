import { describe, expect, it } from 'vitest'
import { emptySlotInput } from '@/components/SlotEditor/slot-input'
import { SLOT_KEYS, SLOT_ROLES } from '@/types'
import {
  applyBatchItems,
  applyBatchSpecs,
  batchScopeTelemetryValue,
  countConfiguredSlotKinds,
  deleteSelectedSlots,
  deleteSlotAt,
  dragAutoScrollDelta,
  duplicateSelectedSlots,
  duplicateSlotAt,
  moveSlotAt,
  moveSlotByDrop,
  moveSlotTo,
  previewBatchItems,
  previewBatchSpecs,
  resolveUndoAfterSlotEdit,
  setSelectedSlotsHidden,
  slotWorkspaceEditorMaxHeight,
} from './slot-workspace'

function configuredSlot(slotNumber: number, id: string) {
  const slot = { ...emptySlotInput(slotNumber), id }
  for (const key of SLOT_KEYS) {
    slot.items[key] = { name: `${key} item`, id: `T8_${key.toUpperCase()}` }
  }
  return slot
}

describe('slot workspace layout', () => {
  it('counts all nine editable gear kinds', () => {
    expect(countConfiguredSlotKinds(configuredSlot(1, 'slot-1'))).toBe(SLOT_KEYS.length)
    expect(SLOT_KEYS).toHaveLength(9)
  })

  it('renumbers slots immediately after moving one', () => {
    const first = configuredSlot(1, 'slot-1')
    const second = configuredSlot(2, 'slot-2')

    const moved = moveSlotAt([first, second], 1, -1)

    expect(moved.map((slot) => [slot.id, slot.slot_number])).toEqual([
      ['slot-2', 1],
      ['slot-1', 2],
    ])
  })

  it('renumbers slots immediately after deleting one', () => {
    const slots = [
      configuredSlot(1, 'slot-1'),
      configuredSlot(2, 'slot-2'),
      configuredSlot(3, 'slot-3'),
    ]

    expect(deleteSlotAt(slots, 1).map((slot) => [slot.id, slot.slot_number])).toEqual([
      ['slot-1', 1],
      ['slot-3', 2],
    ])
  })

  it('supports direct drag-style movement while preserving slot identity', () => {
    const slots = [
      configuredSlot(1, 'slot-1'),
      configuredSlot(2, 'slot-2'),
      configuredSlot(3, 'slot-3'),
    ]

    expect(moveSlotTo(slots, 0, 2).map((slot) => [slot.id, slot.slot_number])).toEqual([
      ['slot-2', 1],
      ['slot-3', 2],
      ['slot-1', 3],
    ])
  })

  it('places a dragged slot before or after the hovered slot by identity', () => {
    const slots = [
      configuredSlot(1, 'slot-1'),
      configuredSlot(2, 'slot-2'),
      configuredSlot(3, 'slot-3'),
      configuredSlot(4, 'slot-4'),
    ]

    expect(moveSlotByDrop(slots, 'slot-1', 'slot-3', 'before').map((slot) => slot.id)).toEqual([
      'slot-2',
      'slot-1',
      'slot-3',
      'slot-4',
    ])
    expect(moveSlotByDrop(slots, 'slot-4', 'slot-2', 'after').map((slot) => slot.id)).toEqual([
      'slot-1',
      'slot-2',
      'slot-4',
      'slot-3',
    ])
  })

  it('does not reorder when a slot is dropped onto itself', () => {
    const slots = [configuredSlot(1, 'slot-1'), configuredSlot(2, 'slot-2')]

    expect(moveSlotByDrop(slots, 'slot-1', 'slot-1', 'after')).toEqual(slots)
  })

  it('calculates bounded viewport auto-scroll near drag edges', () => {
    expect(dragAutoScrollDelta(40, 800)).toBe(-16)
    expect(dragAutoScrollDelta(400, 800)).toBe(0)
    expect(dragAutoScrollDelta(760, 800)).toBe(16)
    expect(dragAutoScrollDelta(-1, 800)).toBe(0)
  })

  it('fits the sticky editor between its actual top and the global save bar', () => {
    expect(slotWorkspaceEditorMaxHeight({
      viewportHeight: 1_000,
      editorTop: 280,
      saveBarTop: 929,
    })).toBe(633)
    expect(slotWorkspaceEditorMaxHeight({
      viewportHeight: 1_000,
      editorTop: 40,
      saveBarTop: 929,
    })).toBe(833)
    expect(slotWorkspaceEditorMaxHeight({
      viewportHeight: 1_000,
      editorTop: 280,
      saveBarTop: 1_200,
    })).toBe(704)
  })

  it('duplicates after the source and clears assignment identity', () => {
    const source = configuredSlot(1, 'slot-1')
    source.assigned_username = 'Assigned member'

    const duplicated = duplicateSlotAt([source], 0, 'slot-copy')

    expect(duplicated).toHaveLength(2)
    expect(duplicated[1]).toMatchObject({
      id: 'slot-copy',
      slot_number: 2,
      assigned_username: null,
      role_name: source.role_name,
      items: source.items,
    })
    expect(duplicated[1].items).not.toBe(source.items)
  })

  it('applies structural actions only to selected slots', () => {
    const first = configuredSlot(1, 'slot-1')
    const second = configuredSlot(2, 'slot-2')
    const third = configuredSlot(3, 'slot-3')
    first.assigned_username = 'Keep assignment'
    second.assigned_username = 'Clear on duplicate'

    expect(setSelectedSlotsHidden([first, second, third], ['slot-1', 'slot-3'], true))
      .toMatchObject([{ is_hidden: true }, { is_hidden: false }, { is_hidden: true }])

    const duplicated = duplicateSelectedSlots(
      [first, second, third],
      ['slot-2'],
      () => 'slot-copy',
    )
    expect(duplicated.map((slot) => [slot.id, slot.slot_number, slot.assigned_username])).toEqual([
      ['slot-1', 1, 'Keep assignment'],
      ['slot-2', 2, 'Clear on duplicate'],
      ['slot-copy', 3, null],
      ['slot-3', 4, null],
    ])

    expect(deleteSelectedSlots(duplicated, ['slot-1', 'slot-copy']).map((slot) => [slot.id, slot.slot_number]))
      .toEqual([
        ['slot-2', 1],
        ['slot-3', 2],
      ])
  })

  it('never drops original slots when selected duplication reaches the party limit', () => {
    const slots = Array.from({ length: 19 }, (_, index) =>
      configuredSlot(index + 1, `slot-${index + 1}`),
    )
    let copyNumber = 0

    const duplicated = duplicateSelectedSlots(
      slots,
      ['slot-1', 'slot-2'],
      () => `copy-${++copyNumber}`,
    )

    expect(duplicated).toHaveLength(20)
    expect(duplicated.filter((slot) => slot.id?.startsWith('copy-'))).toHaveLength(1)
    expect(slots.every((original) => duplicated.some((slot) => slot.id === original.id))).toBe(true)
  })
})

describe('slot workspace undo safety', () => {
  it('keeps a checkpoint for the edit it describes, then expires it before a later edit', () => {
    const receipt = { label: 'Moved slot' }

    const checkpointedEdit = resolveUndoAfterSlotEdit(receipt, true)
    expect(checkpointedEdit).toEqual({
      receipt,
      checkpointPending: false,
      invalidated: false,
    })

    expect(resolveUndoAfterSlotEdit(checkpointedEdit.receipt, checkpointedEdit.checkpointPending))
      .toEqual({
        receipt: null,
        checkpointPending: false,
        invalidated: true,
      })
  })

  it('does not invent an invalidation when no undo receipt exists', () => {
    expect(resolveUndoAfterSlotEdit(null, false)).toEqual({
      receipt: null,
      checkpointPending: false,
      invalidated: false,
    })
  })
})

describe('slot workspace batch previews', () => {
  it('normalizes every batch scope to telemetry-safe metadata', () => {
    const scopes = ['all', 'selected', ...SLOT_ROLES] as const

    expect(scopes.map(batchScopeTelemetryValue)).toEqual([
      'all',
      'selected',
      'caller',
      'off_tanker',
      'def_tanker',
      'sup',
      'healer',
      'engage_dps',
      'brawler_dps',
      'bm',
      'other',
    ])
    expect(scopes.map(batchScopeTelemetryValue).every((scope) => /^[a-z0-9_:-]{1,48}$/.test(scope)))
      .toBe(true)
  })

  it('reports changed, overwritten, and option-skipped item fields before applying', () => {
    const empty = emptySlotInput(1)
    empty.id = 'empty'
    const fixed = emptySlotInput(2)
    fixed.id = 'fixed'
    fixed.items.potion = { name: 'Old potion', id: 'T8_POTION_OLD' }
    const multi = emptySlotInput(3)
    multi.id = 'multi'
    multi.options.potion = [{ name: 'Option potion', id: 'T8_POTION_OPTION' }]
    const picks = { potion: { name: 'New potion', id: 'T8_POTION_NEW' }, mount: null }

    expect(previewBatchItems([empty, fixed, multi], picks, 'all', [])).toEqual({
      targetSlots: 3,
      changedSlots: 2,
      changedFields: 2,
      overwrittenFields: 1,
      skippedOptionSlots: 1,
    })
    expect(applyBatchItems([empty, fixed, multi], picks, 'all', [])[2].options.potion).toHaveLength(1)
  })

  it('counts only fields that will actually be filled by a spec batch', () => {
    const empty = emptySlotInput(1)
    empty.id = 'empty'
    empty.role_name = 'DefTanker'
    const filled = emptySlotInput(2)
    filled.id = 'filled'
    filled.role_name = 'DefTanker'
    filled.specs.weapon = { tier: 8, enchant: 1 }
    const incoming = { weapon: { tier: 8, enchant: 0 } }

    expect(previewBatchSpecs([empty, filled], incoming, 'DefTanker', [])).toEqual({
      targetSlots: 2,
      changedSlots: 1,
      changedFields: 2,
    })
    expect(applyBatchSpecs([empty, filled], incoming, 'DefTanker', [])[1].specs.weapon).toEqual({
      tier: 8,
      enchant: 1,
    })
  })

  it('supports applying batches only to explicitly selected slots', () => {
    const first = emptySlotInput(1)
    first.id = 'first'
    const second = emptySlotInput(2)
    second.id = 'second'
    const incoming = { armor: { tier: 8, enchant: 0 } }

    const applied = applyBatchSpecs([first, second], incoming, 'selected', ['second'])

    expect(applied[0].specs.armor).toEqual({})
    expect(applied[1].specs.armor).toEqual({ tier: 8, enchant: 0 })
  })
})
