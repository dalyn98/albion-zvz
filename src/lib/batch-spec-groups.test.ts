import { describe, expect, it } from 'vitest'
import { expandBatchGroupSpecs, type BatchGroupSpecs } from './batch-spec-groups'

describe('batch spec groups', () => {
  it('expands each equipment slot independently, including offhand', () => {
    const specs: BatchGroupSpecs = {
      weapon: { tier: 8, enchant: 0 },
      offhand: { tier: 7, enchant: 1 },
      head: { tier: 6, enchant: 2 },
      armor: { tier: 5, enchant: 3 },
      shoes: { tier: 4, enchant: 4 },
      cape: {},
      food: {},
      potion: {},
    }

    expect(expandBatchGroupSpecs(specs)).toEqual({
      weapon: { tier: 8, enchant: 0 },
      offhand: { tier: 7, enchant: 1 },
      head: { tier: 6, enchant: 2 },
      armor: { tier: 5, enchant: 3 },
      shoes: { tier: 4, enchant: 4 },
    })
  })

  it('keeps food and potion tierless', () => {
    const specs: BatchGroupSpecs = {
      weapon: {},
      offhand: {},
      head: {},
      armor: {},
      shoes: {},
      cape: {},
      food: { tier: 8, enchant: 1 },
      potion: { tier: 7, enchant: 2 },
    }

    expect(expandBatchGroupSpecs(specs)).toEqual({
      food: { enchant: 1 },
      potion: { enchant: 2 },
    })
  })
})
