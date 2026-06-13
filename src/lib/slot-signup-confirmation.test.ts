import { describe, expect, it } from 'vitest'
import {
  buildSlotSignupGearSummary,
  buildSlotSignupSpellSummary,
} from './slot-signup-confirmation'

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

describe('buildSlotSignupSpellSummary', () => {
  it('uses fixed slot spells for single gear rows', () => {
    expect(
      buildSlotSignupSpellSummary({
        weapon_name: 'Elder Sword',
        weapon_id: 'T8_MAIN_SWORD',
        spells: {
          weapon: ['SWORD_Q', 'SWORD_W', 'SWORD_Q'],
        },
      }),
    ).toEqual([
      {
        kind: 'weapon',
        gearName: 'Elder Sword',
        gearId: 'T8_MAIN_SWORD',
        spellIds: ['SWORD_Q', 'SWORD_W'],
        selected: false,
      },
    ])
  })

  it('uses selected option spells for multi gear rows', () => {
    expect(
      buildSlotSignupSpellSummary(
        {
          weapon_options: [
            { name: 'Elder Sword', id: 'T8_MAIN_SWORD', spells: ['SWORD_Q'] },
            { name: 'Elder Axe', id: 'T8_MAIN_AXE', spells: ['AXE_Q', 'AXE_W'] },
          ],
          spells: {
            weapon: ['IGNORED_SINGLE_SPELL'],
          },
        },
        {
          weapon: { name: 'Picked Axe', id: 'T8_MAIN_AXE' },
        },
      ),
    ).toEqual([
      {
        kind: 'weapon',
        gearName: 'Picked Axe',
        gearId: 'T8_MAIN_AXE',
        spellIds: ['AXE_Q', 'AXE_W'],
        selected: true,
      },
    ])
  })
})
