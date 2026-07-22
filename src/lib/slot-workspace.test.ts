import { describe, expect, it } from 'vitest'
import { emptySlotInput } from '@/components/SlotEditor/slot-input'
import { SLOT_KEYS } from '@/types'
import {
  applyBatchItems,
  applyBatchSpecs,
  countConfiguredSlotKinds,
  deleteSlotAt,
  duplicateSlotAt,
  moveSlotAt,
  moveSlotTo,
  previewBatchItems,
  previewBatchSpecs,
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
})

describe('slot workspace batch previews', () => {
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
