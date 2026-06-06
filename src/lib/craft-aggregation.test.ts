import { describe, expect, it } from 'vitest'
import { aggregateCraftBuilds } from './craft-aggregation'
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

describe('aggregateCraftBuilds', () => {
  it('counts only the slots included in craft fulfillment for each task', () => {
    const snapshot: BuildSnapshot = {
      ...emptySnapshot(),
      weapon: { name: 'Sword', id: 'T8_MAIN_SWORD' },
      head: { name: 'Helmet', id: 'T8_HEAD_PLATE_SET1' },
      cape: { name: 'Cape', id: 'T8_CAPEITEM_FW_BRIDGEWATCH' },
      food: { name: 'Food', id: 'T8_MEAL_BEEFSTEW' },
      potion: { name: 'Potion', id: 'T8_POTION_HEAL' },
      mount: { name: 'Mount', id: 'T8_MOUNT_HORSE' },
    }

    const breakdown = aggregateCraftBuilds([
      {
        snapshot,
        includedSlots: ['weapon', 'head', 'armor', 'shoes', 'offhand'],
      },
    ])

    expect(breakdown.items.map((item) => item.itemId)).toEqual([
      'T8_MAIN_SWORD',
      'T8_HEAD_PLATE_SET1',
    ])
    expect(breakdown.items.map((item) => item.itemId)).not.toContain(
      'T8_CAPEITEM_FW_BRIDGEWATCH',
    )
  })

  it('can include cape for one task without changing other tasks', () => {
    const first: BuildSnapshot = {
      ...emptySnapshot(),
      cape: { name: 'Cape A', id: 'T8_CAPEITEM_FW_BRIDGEWATCH' },
    }
    const second: BuildSnapshot = {
      ...emptySnapshot(),
      cape: { name: 'Cape B', id: 'T8_CAPEITEM_FW_FORTSTERLING' },
    }

    const breakdown = aggregateCraftBuilds([
      { snapshot: first, includedSlots: ['weapon', 'head', 'armor', 'shoes', 'offhand'] },
      { snapshot: second, includedSlots: ['weapon', 'head', 'armor', 'shoes', 'offhand', 'cape'] },
    ])

    expect(breakdown.items.map((item) => item.itemId)).toEqual([
      'T8_CAPEITEM_FW_FORTSTERLING',
    ])
  })
})
