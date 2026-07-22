import { describe, expect, it } from 'vitest'
import { emptySlotInput } from '@/components/SlotEditor/slot-input'
import { buildSingleSlotUpdatePayload } from './single-slot-update-payload'

describe('single slot update payload', () => {
  it('preserves solo-bomb and conditional-option configuration', () => {
    const input = emptySlotInput(4)
    input.is_solo_bomb = true
    input.options.weapon = [
      { name: 'Broadsword', id: 'T8_MAIN_SWORD' },
      { name: 'Great Axe', id: 'T8_2H_AXE' },
    ]
    input.options.armor = [
      { name: 'Judicator Armor', id: 'T8_ARMOR_PLATE_KEEPER' },
      { name: 'Guardian Armor', id: 'T8_ARMOR_PLATE_SET3' },
    ]
    input.conditional_options = {
      armor: {
        T8_MAIN_SWORD: [{ name: 'Judicator Armor', id: 'T8_ARMOR_PLATE_KEEPER' }],
      },
    }

    expect(buildSingleSlotUpdatePayload(input)).toMatchObject({
      is_solo_bomb: true,
      conditional_options: input.conditional_options,
    })
  })
})
