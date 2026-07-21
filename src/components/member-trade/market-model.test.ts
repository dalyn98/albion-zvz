import { describe, expect, it } from 'vitest'
import {
  createEmptyListingDraft,
  isListingDraftDirty,
  parseDraftInput,
  type ListingDraft,
} from './market-model'

function validDraft(): ListingDraft {
  return {
    title: 'Healing set',
    description: 'Ready for delivery',
    city: 'Martlock',
    deliveryNote: 'DM first',
    items: [
      {
        id: 'item-1',
        itemQuery: 'T8_MAIN_HOLYSTAFF',
        selectedItem: null,
        enchant: '2',
        quality: '3',
        quantity: '2',
        unitPoints: '1,250',
      },
    ],
  }
}

describe('member trade market model', () => {
  it('creates a clean one-item draft', () => {
    const draft = createEmptyListingDraft()

    expect(draft.items).toHaveLength(1)
    expect(isListingDraftDirty(draft)).toBe(false)
  })

  it('parses formatted point inputs without changing listing semantics', () => {
    expect(parseDraftInput(validDraft())).toEqual({
      title: 'Healing set',
      description: 'Ready for delivery',
      city: 'Martlock',
      deliveryNote: 'DM first',
      items: [{
        itemQuery: 'T8_MAIN_HOLYSTAFF',
        enchant: 2,
        quality: 3,
        quantity: 2,
        unitPoints: 1250,
      }],
    })
  })

  it('rejects incomplete items and marks edited drafts dirty', () => {
    const draft = validDraft()
    expect(isListingDraftDirty(draft)).toBe(true)
    expect(parseDraftInput({
      ...draft,
      items: [{ ...draft.items[0], quantity: '0' }],
    })).toBeNull()
  })
})
