import { describe, expect, it } from 'vitest'
import type { ConditionalSlotOptions, SlotKey } from '@/types'
import {
  applyGearChoicePick,
  getFirstMissingGearChoiceKind,
  hasSequentialGearChoices,
  isGearChoiceKindLocked,
} from './gear-choice-sequence'

function slotWithConditional(conditionalOptions: ConditionalSlotOptions | null) {
  return { conditional_options: conditionalOptions }
}

describe('gear choice sequence', () => {
  const kinds: SlotKey[] = ['weapon', 'head', 'armor']

  it('locks later gear choices until earlier choices are selected when conditional rules exist', () => {
    const slot = slotWithConditional({
      head: {
        T8_MAIN_SWORD: [{ name: 'Elder Knight Helmet', id: 'T8_HEAD_PLATE_SET1' }],
      },
    })
    const picks = {}

    expect(hasSequentialGearChoices(slot, kinds)).toBe(true)
    expect(getFirstMissingGearChoiceKind(kinds, picks)).toBe('weapon')
    expect(isGearChoiceKindLocked(slot, kinds, picks, 'weapon')).toBe(false)
    expect(isGearChoiceKindLocked(slot, kinds, picks, 'head')).toBe(true)
    expect(isGearChoiceKindLocked(slot, kinds, picks, 'armor')).toBe(true)

    const withWeapon = { weapon: 'T8_MAIN_SWORD' }
    expect(isGearChoiceKindLocked(slot, kinds, withWeapon, 'head')).toBe(false)
    expect(isGearChoiceKindLocked(slot, kinds, withWeapon, 'armor')).toBe(true)
  })

  it('does not force sequential picking when no conditional rules exist', () => {
    const slot = slotWithConditional(null)

    expect(hasSequentialGearChoices(slot, kinds)).toBe(false)
    expect(isGearChoiceKindLocked(slot, kinds, {}, 'armor')).toBe(false)
  })

  it('clears later picks after changing an earlier pick in a sequential flow', () => {
    const current = {
      weapon: 'T8_MAIN_SWORD',
      head: 'T8_HEAD_PLATE_SET1',
      armor: 'T8_ARMOR_PLATE_SET1',
    }

    expect(applyGearChoicePick({
      picks: current,
      kinds,
      kind: 'weapon',
      optionId: 'T8_2H_AXE',
      sequential: true,
    })).toEqual({ weapon: 'T8_2H_AXE' })

    expect(applyGearChoicePick({
      picks: current,
      kinds,
      kind: 'weapon',
      optionId: 'T8_2H_AXE',
      sequential: false,
    })).toEqual({
      weapon: 'T8_2H_AXE',
      head: 'T8_HEAD_PLATE_SET1',
      armor: 'T8_ARMOR_PLATE_SET1',
    })
  })
})
