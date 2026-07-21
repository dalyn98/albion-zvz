import type { CreateMemberTradeListingInput } from '@/app/actions/member-trade'
import type { TradeItemSearchResult } from './TradeItemSearchInput'
import { formatSilver, parseSilverInput } from '@/lib/silver'

export interface ListingDraft {
  title: string
  description: string
  city: string
  deliveryNote: string
  items: ListingItemDraft[]
}

export interface ListingItemDraft {
  id: string
  itemQuery: string
  selectedItem: TradeItemSearchResult | null
  enchant: string
  quality: string
  quantity: string
  unitPoints: string
}

export function createEmptyItemDraft(): ListingItemDraft {
  return {
    id: crypto.randomUUID(),
    itemQuery: '',
    selectedItem: null,
    enchant: '0',
    quality: '',
    quantity: '1',
    unitPoints: '',
  }
}

export function createEmptyListingDraft(): ListingDraft {
  return {
    title: '',
    description: '',
    city: '',
    deliveryNote: '',
    items: [createEmptyItemDraft()],
  }
}

export function formatPointDraftInput(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (!digits) return ''
  return formatSilver(Number(digits))
}

export function parseDraftInput(draft: ListingDraft): CreateMemberTradeListingInput | null {
  if (!draft.title.trim()) return null
  const items = draft.items.map((item) => {
    const quantity = parseSilverInput(item.quantity)
    const unitPoints = parseSilverInput(item.unitPoints)
    const enchant = Number(item.enchant)
    const quality = item.quality ? Number(item.quality) : null
    if (!item.itemQuery.trim()) return null
    if (quantity === null || quantity <= 0) return null
    if (unitPoints === null || unitPoints <= 0) return null
    if (!Number.isInteger(enchant) || enchant < 0 || enchant > 4) return null
    if (quality !== null && (!Number.isInteger(quality) || quality < 1 || quality > 5)) return null
    return {
      itemQuery: item.itemQuery,
      enchant,
      quality,
      quantity,
      unitPoints,
    }
  })
  if (items.length === 0 || items.some((item) => item === null)) return null
  return {
    title: draft.title,
    description: draft.description,
    items: items as CreateMemberTradeListingInput['items'],
    city: draft.city,
    deliveryNote: draft.deliveryNote,
  }
}

export function isListingDraftDirty(draft: ListingDraft): boolean {
  return (
    Boolean(draft.title.trim()) ||
    Boolean(draft.description.trim()) ||
    Boolean(draft.city.trim()) ||
    Boolean(draft.deliveryNote.trim()) ||
    draft.items.length > 1 ||
    draft.items.some((item) =>
      Boolean(item.itemQuery.trim()) ||
      Boolean(item.unitPoints.trim()) ||
      item.quantity.trim() !== '1' ||
      item.enchant !== '0' ||
      Boolean(item.quality),
    )
  )
}
