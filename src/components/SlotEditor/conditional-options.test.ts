import { describe, expect, it } from 'vitest'
import { SLOT_KEYS, type GearOption, type SlotKey } from '@/types'
import {
  CONDITIONAL_DEPENDENT_SLOT_KEYS,
  getConditionalDependentKinds,
} from './conditional-options'

function emptyOptions(): Record<SlotKey, GearOption[]> {
  return SLOT_KEYS.reduce(
    (acc, key) => ({ ...acc, [key]: [] }),
    {} as Record<SlotKey, GearOption[]>,
  )
}

describe('conditional slot options', () => {
  it('uses weapon as the driver and includes food, potion, and cape as dependents', () => {
    expect(CONDITIONAL_DEPENDENT_SLOT_KEYS).not.toContain('weapon')
    expect(CONDITIONAL_DEPENDENT_SLOT_KEYS).toEqual(
      expect.arrayContaining(['food', 'potion', 'cape']),
    )
  })

  it('returns only dependent kinds with configured multi options', () => {
    const options = {
      ...emptyOptions(),
      weapon: [{ id: 'T8_MAIN_SWORD', name: 'Elder Broadsword' }],
      food: [{ id: 'T8_MEAL_STEW', name: 'Elder Beef Stew' }],
      potion: [{ id: 'T8_POTION_HEAL', name: 'Elder Healing Potion' }],
      cape: [{ id: 'T8_CAPEITEM_MORGANA', name: 'Elder Morgana Cape' }],
    }

    expect(getConditionalDependentKinds(options)).toEqual(['potion', 'food', 'cape'])
  })
})
