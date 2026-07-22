import { describe, expect, it } from 'vitest'
import { FREE_ITEM_NAME } from '@/types'
import {
  MAX_GEAR_OPTIONS,
  deriveGearMode,
  emptySlotInput,
  freeSlotItem,
  getBuildPreviewRowMode,
} from './slot-input'

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

describe('slot input multi gear options', () => {
  it('allows up to twelve options per gear kind', () => {
    expect(MAX_GEAR_OPTIONS).toBe(12)
  })
})

describe('build preview row mode', () => {
  it('keeps the selected gear visible alongside explicit spells', () => {
    expect(getBuildPreviewRowMode(['SWORD_Q'])).toBe('gear-with-spells')
  })

  it('falls back to the gear preview when no spell is configured', () => {
    expect(getBuildPreviewRowMode([])).toBe('gear')
  })
})
