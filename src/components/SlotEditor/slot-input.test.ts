import { describe, expect, it } from 'vitest'
import { FREE_ITEM_NAME } from '@/types'
import { deriveGearMode, emptySlotInput, freeSlotItem } from './slot-input'

describe('slot input free marker', () => {
  it('stores free slots with the stable internal marker', () => {
    const slot = emptySlotInput(1)
    slot.items.weapon = freeSlotItem()

    expect(slot.items.weapon).toEqual({ name: FREE_ITEM_NAME, id: '' })
    expect(deriveGearMode(slot, 'weapon')).toBe('free')
  })

  it('does not treat localized display labels as free markers', () => {
    const slot = emptySlotInput(1)
    slot.items.weapon = { name: 'Free', id: '' }

    expect(deriveGearMode(slot, 'weapon')).toBe('single')
  })
})
