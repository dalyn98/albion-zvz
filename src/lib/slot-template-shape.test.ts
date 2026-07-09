import { describe, expect, it } from 'vitest'
import { emptySlotInput } from '@/components/SlotEditor/slot-input'
import {
  NO_OFFHAND_OPTION_ID,
  NO_OFFHAND_OPTION_NAME,
} from '@/types'
import { applyTemplateToSlotInput, slotInputToTemplateData } from './slot-template-shape'

describe('slot-template-shape', () => {
  it('keeps no-offhand conditional candidates when saving and loading slot templates', () => {
    const slot = emptySlotInput(1)
    slot.options.weapon = [
      { name: 'Elder Broadsword', id: 'T8_MAIN_SWORD' },
      { name: 'Elder Great Axe', id: 'T8_2H_AXE' },
    ]
    slot.options.offhand = [
      { name: 'Elder Torch', id: 'T8_OFF_TORCH' },
    ]
    slot.options.head = [
      { name: 'Elder Knight Helmet', id: 'T8_HEAD_PLATE_SET1' },
    ]
    slot.conditional_options = {
      offhand: {
        T8_2H_AXE: [{ name: NO_OFFHAND_OPTION_NAME, id: NO_OFFHAND_OPTION_ID }],
      },
      head: {
        T8_2H_AXE: [{ name: NO_OFFHAND_OPTION_NAME, id: NO_OFFHAND_OPTION_ID }],
      },
    }

    const data = slotInputToTemplateData(slot)

    expect(data.conditional_options).toEqual({
      offhand: {
        T8_2H_AXE: [{ name: NO_OFFHAND_OPTION_NAME, id: NO_OFFHAND_OPTION_ID }],
      },
    })

    expect(applyTemplateToSlotInput(emptySlotInput(2), data).conditional_options).toEqual({
      offhand: {
        T8_2H_AXE: [{ name: NO_OFFHAND_OPTION_NAME, id: NO_OFFHAND_OPTION_ID }],
      },
    })
  })
})
