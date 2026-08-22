import { describe, expect, it } from 'vitest'
import { calculateGearOptionsPopoverPosition } from './GearPreview'

describe('calculateGearOptionsPopoverPosition', () => {
  it('anchors the options card below the trigger when the viewport has room', () => {
    expect(calculateGearOptionsPopoverPosition({
      trigger: { left: 500, right: 555, top: 100, bottom: 155 },
      viewportWidth: 1200,
      viewportHeight: 800,
      optionCount: 4,
    })).toEqual({
      left: 359.5,
      top: 163,
      width: 336,
      maxHeight: 784,
    })
  })

  it('keeps the card inside a narrow mobile viewport and opens it above when needed', () => {
    expect(calculateGearOptionsPopoverPosition({
      trigger: { left: 250, right: 305, top: 650, bottom: 705 },
      viewportWidth: 320,
      viewportHeight: 700,
      optionCount: 8,
    })).toEqual({
      left: 8,
      top: 246,
      width: 304,
      maxHeight: 684,
    })
  })
})
