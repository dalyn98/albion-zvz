import { describe, expect, it } from 'vitest'
import { buildSlotSignupGearSummary } from './slot-signup-confirmation'

describe('buildSlotSignupGearSummary', () => {
  it('prefers member picks over fixed slot gear', () => {
    expect(
      buildSlotSignupGearSummary(
        {
          weapon_name: 'Fixed Sword',
          weapon_id: 'T8_MAIN_SWORD',
          armor_name: 'Fixed Armor',
          armor_id: 'T8_ARMOR_PLATE_SET1',
        },
        {
          weapon: { name: 'Picked Axe', id: 'T8_MAIN_AXE' },
        },
      ),
    ).toEqual([
      {
        kind: 'weapon',
        name: 'Picked Axe',
        id: 'T8_MAIN_AXE',
        selected: true,
      },
      {
        kind: 'armor',
        name: 'Fixed Armor',
        id: 'T8_ARMOR_PLATE_SET1',
        selected: false,
      },
    ])
  })

  it('omits empty gear and trims names', () => {
    expect(
      buildSlotSignupGearSummary({
        weapon_name: '  Elder Sword  ',
        weapon_id: '  T8_MAIN_SWORD  ',
        head_name: '',
        head_id: '',
      }),
    ).toEqual([
      {
        kind: 'weapon',
        name: 'Elder Sword',
        id: 'T8_MAIN_SWORD',
        selected: false,
      },
    ])
  })
})
