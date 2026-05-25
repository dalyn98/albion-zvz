import { describe, expect, it } from 'vitest'
import { getDisplayGear, type SlotGearDisplay } from './index'

function gear(overrides: Partial<SlotGearDisplay>): SlotGearDisplay {
  const base: Record<string, string | null> = {}
  for (const key of ['weapon', 'head', 'armor', 'shoes', 'offhand', 'potion', 'food', 'cape', 'mount']) {
    base[`${key}_name`] = null
    base[`${key}_id`] = null
    base[`assigned_${key}_name`] = null
    base[`assigned_${key}_id`] = null
  }
  return { ...base, ...overrides } as SlotGearDisplay
}

describe('getDisplayGear', () => {
  it('uses an assigned free-form name even when there is no Albion item id', () => {
    expect(
      getDisplayGear(
        gear({
          weapon_name: 'Default weapon',
          weapon_id: 'T8_MAIN_DEFAULT',
          assigned_weapon_name: 'Caller free-form weapon',
          assigned_weapon_id: '',
        }),
        'weapon',
      ),
    ).toEqual({
      name: 'Caller free-form weapon',
      id: '',
    })
  })
})
