import { describe, expect, it } from 'vitest'
import type { AlbionItem } from '@/types'
import { filterItemsForPicker, itemMatchesPickerFilters } from './item-picker-eligibility'

const weapon: AlbionItem = {
  uniqueName: 'T8_2H_AXE',
  displayName: '장로의 그레이트액스',
  category: 'weapon',
}

const armor: AlbionItem = {
  uniqueName: 'T8_ARMOR_PLATE_SET1',
  displayName: '장로의 병사 갑옷',
  category: 'armor',
}

describe('item picker eligibility', () => {
  it('keeps only items matching the picker part and tier', () => {
    expect(filterItemsForPicker([weapon, armor], 'weapon', 8)).toEqual([weapon])
    expect(itemMatchesPickerFilters(weapon, 'weapon', 7)).toBe(false)
  })

  it('supports pickers that intentionally accept multiple categories', () => {
    expect(itemMatchesPickerFilters(weapon, 'mount,weapon', 8)).toBe(true)
  })

  it('rejects legacy recent items without category metadata in scoped pickers', () => {
    const legacyRecent = {
      uniqueName: 'T8_2H_AXE',
      displayName: '장로의 그레이트액스',
    }

    expect(itemMatchesPickerFilters(legacyRecent, 'weapon', 8)).toBe(false)
    expect(itemMatchesPickerFilters(legacyRecent)).toBe(true)
  })
})
