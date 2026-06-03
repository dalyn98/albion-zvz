import { describe, expect, it } from 'vitest'
import {
  buildAlbionItemImageUrl,
  buildAlbionItemImageUrlCandidates,
  normalizeAlbionItemImageId,
} from './albion-render'

describe('Albion render item image URLs', () => {
  it('normalizes shop item ids by applying enchant exactly once', () => {
    expect(normalizeAlbionItemImageId('T6_ARMOR_PLATE_SET3', 3)).toBe('T6_ARMOR_PLATE_SET3@3')
    expect(normalizeAlbionItemImageId('T6_ARMOR_PLATE_SET3@3', 3)).toBe('T6_ARMOR_PLATE_SET3@3')
    expect(normalizeAlbionItemImageId('T6_ARMOR_PLATE_SET3@3', 0)).toBe('T6_ARMOR_PLATE_SET3')
  })

  it('encodes the item id path segment and keeps quality and size as query params', () => {
    expect(
      buildAlbionItemImageUrl({
        uniqueName: 'T8_MAIN_HOLYSTAFF',
        enchant: 4,
        quality: 3,
        size: 64,
      }),
    ).toBe('https://render.albiononline.com/v1/item/T8_MAIN_HOLYSTAFF%404.png?quality=3&size=64')
  })

  it('builds qualityless and base-item fallback candidates without duplicates', () => {
    expect(
      buildAlbionItemImageUrlCandidates({
        uniqueName: 'T7_2H_CLAYMORE_AVALON@3',
        enchant: 3,
        quality: 4,
        size: 48,
      }),
    ).toEqual([
      'https://render.albiononline.com/v1/item/T7_2H_CLAYMORE_AVALON%403.png?quality=4&size=48',
      'https://render.albiononline.com/v1/item/T7_2H_CLAYMORE_AVALON%403.png?size=48',
      'https://render.albiononline.com/v1/item/T7_2H_CLAYMORE_AVALON.png?quality=4&size=48',
      'https://render.albiononline.com/v1/item/T7_2H_CLAYMORE_AVALON.png?size=48',
    ])
  })
})
