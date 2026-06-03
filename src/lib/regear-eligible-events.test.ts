import { describe, expect, it } from 'vitest'
import {
  buildManualRegearEligibilityRoleMap,
  buildRegearEventRoleMap,
} from './regear-eligible-events'

describe('buildRegearEventRoleMap', () => {
  it('keeps assigned events visible even when the slot role is missing', () => {
    const map = buildRegearEventRoleMap([
      { eventId: 'event-1', roleName: null },
      { eventId: 'event-2', roleName: 'Dps' },
    ])

    expect(map.get('event-1')).toBe('')
    expect(map.get('event-2')).toBe('Dps')
  })

  it('prefers a non-empty role when duplicate assigned slots exist for one event', () => {
    const map = buildRegearEventRoleMap([
      { eventId: 'event-1', roleName: null },
      { eventId: 'event-1', roleName: ' Healer ' },
    ])

    expect(map.get('event-1')).toBe('Healer')
  })
})

describe('buildManualRegearEligibilityRoleMap', () => {
  it('uses slot roles for combat events', () => {
    const map = buildManualRegearEligibilityRoleMap(
      [{ eventId: 'combat-1', category: '전투' }],
      new Map([['combat-1', 'Dps']]),
      new Map([['combat-1', 'Healer']]),
    )

    expect(map.get('combat-1')).toBe('Dps')
  })

  it('uses participant roles for FF and does not fall back to slots', () => {
    const map = buildManualRegearEligibilityRoleMap(
      [
        { eventId: 'ff-1', category: 'FF' },
        { eventId: 'ff-2', category: 'FF' },
      ],
      new Map([
        ['ff-1', 'Dps'],
        ['ff-2', 'Healer'],
      ]),
      new Map([['ff-1', 'Caller']]),
    )

    expect(map.get('ff-1')).toBe('Caller')
    expect(map.has('ff-2')).toBe(false)
  })
})
