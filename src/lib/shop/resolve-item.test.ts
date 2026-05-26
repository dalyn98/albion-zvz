import { describe, expect, it } from 'vitest'
import { resolveAlbionItem, resolveKoItem } from './resolve-item'

describe('resolveAlbionItem', () => {
  it('resolves bundled item names across supported Albion locales', () => {
    expect(resolveAlbionItem("Expert's Hellion Jacket")?.uniqueName).toBe(
      'T5_ARMOR_LEATHER_HELL',
    )
    expect(resolveAlbionItem('ヘリオンジャケット（達人）')?.uniqueName).toBe(
      'T5_ARMOR_LEATHER_HELL',
    )
    expect(resolveAlbionItem('专家级喧嚣外套')?.uniqueName).toBe(
      'T5_ARMOR_LEATHER_HELL',
    )
  })

  it('keeps the legacy Korean resolver entry point compatible', () => {
    expect(resolveKoItem('전문가의 무법자 재킷')?.uniqueName).toBe(
      'T5_ARMOR_LEATHER_HELL',
    )
  })

  it('accepts raw Albion UniqueName values from external tools', () => {
    expect(resolveAlbionItem('T5_ARMOR_LEATHER_HELL@3')?.uniqueName).toBe(
      'T5_ARMOR_LEATHER_HELL',
    )
  })
})
