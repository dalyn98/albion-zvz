import { describe, expect, it } from 'vitest'
import { DEMO_EVENTS, DEMO_EVENT_DETAIL } from '@/data/demo-seed'
import {
  buildDemoEventReadinessMap,
  resolveDemoEventSlotGear,
} from './demo-event-model'

describe('demo event model', () => {
  it('keeps event-list readiness aligned with the shared demo seed', () => {
    const readinessByEventId = buildDemoEventReadinessMap(DEMO_EVENTS)

    expect(readinessByEventId['evt-1']).toEqual({
      totalSlots: 7,
      assignedSlots: 5,
      openSlots: 2,
      fillPercent: 71,
      status: 'needsMembers',
    })
    expect(readinessByEventId['evt-3']).toMatchObject({
      totalSlots: 4,
      assignedSlots: 4,
      status: 'full',
    })
  })

  it('keeps the primary detail scenario aligned with its list summary', () => {
    const listItem = DEMO_EVENTS.find((event) => event.id === DEMO_EVENT_DETAIL.id)
    const slots = DEMO_EVENT_DETAIL.parties.flatMap((party) => party.slots)

    expect(listItem).toMatchObject({
      id: DEMO_EVENT_DETAIL.id,
      name: DEMO_EVENT_DETAIL.name,
      filledCount: DEMO_EVENT_DETAIL.filledCount,
      totalCount: DEMO_EVENT_DETAIL.totalCount,
    })
    expect(slots).toHaveLength(DEMO_EVENT_DETAIL.totalCount)
    expect(slots.filter((slot) => slot.assigned)).toHaveLength(DEMO_EVENT_DETAIL.filledCount)
  })

  it.each([
    ['Dagger Pair', 'T8_2H_DAGGERPAIR'],
    ['Great Fire Staff', 'T8_2H_FIRESTAFF'],
    ['Heavy Crossbow', 'T8_2H_CROSSBOWLARGE'],
  ] as const)('maps %s to its real Albion item id', (weapon, weaponId) => {
    const gear = resolveDemoEventSlotGear({
      role: 'engageDps',
      buildLabel: `${weapon} · 8F`,
      weapon,
      flat: 8,
    })

    expect(gear.weapon).toBe(weapon)
    expect(gear.weaponId).toBe(weaponId)
  })
})
