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

  it('resolves special shop log names omitted from the trimmed item bundle', () => {
    expect(resolveKoItem('유령의 박쥐')?.uniqueName).toBe('UNIQUE_MOUNT_BAT_PERSONAL')
    expect(resolveKoItem('크리스탈 방랑하는 요새')?.uniqueName).toBe(
      'UNIQUE_MOUNT_BASTION_CRYSTAL',
    )
    expect(resolveKoItem('골드 방랑하는 요새')?.uniqueName).toBe(
      'UNIQUE_MOUNT_BASTION_GOLD',
    )
    expect(resolveKoItem('모르가나의 까마귀')?.uniqueName).toBe(
      'UNIQUE_MOUNT_MORGANA_RAVEN_ADC',
    )
    expect(resolveKoItem('블랙 팬서')?.uniqueName).toBe(
      'UNIQUE_MOUNT_BLACK_PANTHER_ADC',
    )
    expect(resolveKoItem('은신처 건설키트')?.uniqueName).toBe('UNIQUE_HIDEOUT')
  })
})
