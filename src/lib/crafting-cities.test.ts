import { describe, expect, it } from 'vitest'
import { getTaskCities } from './crafting-cities'
import type { BuildSnapshot } from '@/types'

function emptySnapshot(): BuildSnapshot {
  return {
    role_name: null,
    weapon: { name: null, id: null },
    head: { name: null, id: null },
    armor: { name: null, id: null },
    shoes: { name: null, id: null },
    offhand: { name: null, id: null },
    potion: { name: null, id: null },
    food: { name: null, id: null },
    cape: { name: null, id: null },
    mount: { name: null, id: null },
  }
}

describe('getTaskCities', () => {
  it('uses craft fulfillment slots instead of every item in the build snapshot', () => {
    const snapshot: BuildSnapshot = {
      ...emptySnapshot(),
      weapon: { name: 'Sword', id: 'T8_MAIN_SWORD' },
      cape: { name: 'Cape', id: 'T8_CAPEITEM_FW_BRIDGEWATCH' },
    }

    const cities = getTaskCities(snapshot, ['weapon', 'head', 'armor', 'shoes', 'offhand'])

    expect([...cities]).toEqual(['lymhurst'])
    expect(cities.has('caerleon')).toBe(false)
  })
})
