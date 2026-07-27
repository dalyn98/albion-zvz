import type { AlbionItem } from '@/types'

function normalizeCategories(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((category) => category.trim().toLowerCase())
    .filter(Boolean)
}

function itemTier(uniqueName: string): number | null {
  const match = /^T([1-8])_/i.exec(uniqueName)
  return match ? Number(match[1]) : null
}

export function itemMatchesPickerFilters(
  item: AlbionItem,
  category?: string,
  tier?: number,
): boolean {
  const categories = normalizeCategories(category)
  if (categories.length > 0) {
    const itemCategory = typeof item.category === 'string'
      ? item.category.trim().toLowerCase()
      : ''
    if (!itemCategory || !categories.includes(itemCategory)) return false
  }

  return tier == null || itemTier(item.uniqueName) === tier
}

export function filterItemsForPicker(
  items: readonly AlbionItem[],
  category?: string,
  tier?: number,
): AlbionItem[] {
  return items.filter((item) => itemMatchesPickerFilters(item, category, tier))
}
