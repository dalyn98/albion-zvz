import { describe, expect, it } from 'vitest'
import { resolveTentativeSlotPickerPosition } from './tentative-slot-picker-position'

const base = {
  panelWidth: 352,
  panelHeight: 291,
  viewportWidth: 1280,
  viewportHeight: 800,
  viewportGap: 16,
  triggerGap: 8,
}

describe('tentative slot picker position', () => {
  it('aligns to the trigger and opens below when the measured panel fits', () => {
    expect(resolveTentativeSlotPickerPosition({
      ...base,
      trigger: { top: 220, bottom: 264, right: 837 },
    })).toEqual({ left: 485, top: 272 })
  })

  it('opens above and remains inside the viewport near the bottom edge', () => {
    expect(resolveTentativeSlotPickerPosition({
      ...base,
      trigger: { top: 650, bottom: 694, right: 1268 },
    })).toEqual({ left: 912, top: 351 })
  })

  it('clamps oversized panels to the viewport gap', () => {
    expect(resolveTentativeSlotPickerPosition({
      ...base,
      panelHeight: 900,
      trigger: { top: 300, bottom: 344, right: 200 },
    })).toEqual({ left: 16, top: 16 })
  })
})
