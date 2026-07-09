import { describe, expect, it } from 'vitest'
import {
  canRequestRegearFromEventStatus,
  buildManualRegearEligibilityRoleMap,
  buildRegearEventRoleMap,
} from './regear-eligible-events'

describe('buildRegearEventRoleMap', () => {
  it('keeps assigned events visible even when the slot role is missing', () => {
    const map = buildRegearEventRoleMap([
      { eventId: 'event-1', roleName: null },
      { eventId: 'event-2', roleName: 'Dps' },
      { eventId: 'event-3', roleName: 'BrawlerDps' },
    ])

    expect(map.get('event-1')).toBe('')
    expect(map.get('event-2')).toBe('EngageDps')
    expect(map.get('event-3')).toBe('BrawlerDps')
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
      new Map([['combat-1', 'BrawlerDps']]),
      new Map([['combat-1', 'Healer']]),
    )

    expect(map.get('combat-1')).toBe('BrawlerDps')
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

describe('canRequestRegearFromEventStatus', () => {
  it('keeps combat event status cards tied to a current assigned slot', () => {
    expect(
      canRequestRegearFromEventStatus({
        isMember: true,
        battleStarted: true,
        category: '전투',
        hasCurrentSlot: true,
        hasEventRegearParticipant: false,
        regearPolicy: 'role',
      }),
    ).toBe(true)

    expect(
      canRequestRegearFromEventStatus({
        isMember: true,
        battleStarted: true,
        category: '전투',
        hasCurrentSlot: false,
        hasEventRegearParticipant: true,
        regearPolicy: 'role',
      }),
    ).toBe(false)
  })

  it('lets FF and ganking participants request regear even after cancelling their slot', () => {
    expect(
      canRequestRegearFromEventStatus({
        isMember: true,
        battleStarted: true,
        category: 'FF',
        hasCurrentSlot: false,
        hasEventRegearParticipant: true,
        regearPolicy: 'event',
      }),
    ).toBe(true)

    expect(
      canRequestRegearFromEventStatus({
        isMember: true,
        battleStarted: true,
        category: '갱킹',
        hasCurrentSlot: false,
        hasEventRegearParticipant: true,
        regearPolicy: 'role',
      }),
    ).toBe(true)
  })

  it('hides the non-combat regear CTA before battle start or when event regear is disabled', () => {
    expect(
      canRequestRegearFromEventStatus({
        isMember: true,
        battleStarted: false,
        category: 'FF',
        hasCurrentSlot: false,
        hasEventRegearParticipant: true,
        regearPolicy: 'event',
      }),
    ).toBe(false)

    expect(
      canRequestRegearFromEventStatus({
        isMember: true,
        battleStarted: true,
        category: '갱킹',
        hasCurrentSlot: false,
        hasEventRegearParticipant: true,
        regearPolicy: 'disabled',
      }),
    ).toBe(false)
  })
})
