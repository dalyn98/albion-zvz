import { describe, expect, it } from 'vitest'
import {
  OBSERVED_WEAPON_SOURCE,
  OBSERVED_WEAPON_WINDOW_DAYS,
  observedWeaponWindowStart,
  resolveObservedWeaponUsage,
} from './observed-weapon-usage'

describe('resolveObservedWeaponUsage', () => {
  it('deduplicates member + category + battle while preserving other members', () => {
    const usage = resolveObservedWeaponUsage([
      {
        memberId: 'member-a',
        battleId: 'battle-1',
        itemType: 'T6_2H_HOLYSTAFF_MORGANA@2',
        observedAt: '2026-07-01T00:00:00.000Z',
      },
      {
        memberId: 'member-a',
        battleId: 'battle-1',
        itemType: 'T8_2H_HOLYSTAFF',
        observedAt: '2026-07-01T00:01:00.000Z',
      },
      {
        memberId: 'member-b',
        battleId: 'battle-1',
        itemType: 'T7_2H_HOLYSTAFF_AVALON@1',
        observedAt: '2026-07-01T00:02:00.000Z',
      },
    ])

    expect(usage).toEqual({
      source: OBSERVED_WEAPON_SOURCE,
      windowDays: OBSERVED_WEAPON_WINDOW_DAYS,
      sampleCount: 2,
      categories: [
        {
          category: 'HOLYSTAFF',
          sampleItemId: 'T7_2H_HOLYSTAFF_AVALON@1',
          observationCount: 2,
        },
      ],
    })
  })

  it('does not manufacture observations from missing members, battles, or equipment', () => {
    expect(
      resolveObservedWeaponUsage([
        { memberId: null, battleId: 'battle-1', itemType: 'T8_MAIN_SWORD', observedAt: null },
        { memberId: 'member-a', battleId: null, itemType: 'T8_MAIN_SWORD', observedAt: null },
        { memberId: 'member-a', battleId: 'battle-1', itemType: null, observedAt: null },
      ]),
    ).toMatchObject({ sampleCount: 0, categories: [] })
  })

  it('uses a shared rolling 30-day boundary', () => {
    expect(observedWeaponWindowStart(new Date('2026-07-31T00:00:00.000Z'))).toBe(
      '2026-07-01T00:00:00.000Z',
    )
  })
})
