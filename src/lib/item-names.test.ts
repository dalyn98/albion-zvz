import { describe, expect, it } from 'vitest'
import { getLocalizedBaseItemName, stripLocalizedTierName } from './item-names'

describe('stripLocalizedTierName', () => {
  it('removes Korean tier prefixes', () => {
    expect(stripLocalizedTierName('장인의 승용마', 'ko')).toBe('승용마')
    expect(stripLocalizedTierName('숙련된 낚시꾼 모자', 'ko')).toBe('낚시꾼 모자')
    expect(stripLocalizedTierName('전문 낚시꾼 의상', 'ko')).toBe('낚시꾼 의상')
    expect(stripLocalizedTierName('마스터 낚시꾼 작업화', 'ko')).toBe('낚시꾼 작업화')
    expect(stripLocalizedTierName('장로의 메이스', 'ko')).toBe('메이스')
    expect(stripLocalizedTierName('장로 낚시꾼 모자', 'ko')).toBe('낚시꾼 모자')
    expect(stripLocalizedTierName('명인의 창', 'ko')).toBe('창')
    expect(stripLocalizedTierName('그랜드 마스터의 헤비 메이스', 'ko')).toBe('헤비 메이스')
    expect(stripLocalizedTierName('그랜드마스터의 난투 장갑', 'ko')).toBe('난투 장갑')
  })

  it('removes English tier prefixes case-insensitively', () => {
    expect(stripLocalizedTierName("Journeyman's Riding Horse", 'en')).toBe('Riding Horse')
    expect(stripLocalizedTierName("Elder's Mace", 'en')).toBe('Mace')
    expect(stripLocalizedTierName("Grandmaster's Heavy Mace", 'en')).toBe('Heavy Mace')
  })

  it('removes Japanese tier suffixes', () => {
    expect(stripLocalizedTierName('乗用馬（熟練）', 'ja')).toBe('乗用馬')
    expect(stripLocalizedTierName('メイス（老熟）', 'ja')).toBe('メイス')
    expect(stripLocalizedTierName('ヘビーメイス（グランドマスター）', 'ja')).toBe('ヘビーメイス')
    expect(stripLocalizedTierName('グランドマスターの青い炎のたいまつ', 'ja')).toBe(
      '青い炎のたいまつ',
    )
  })

  it('removes Chinese tier prefixes', () => {
    expect(stripLocalizedTierName('学徒级骑乘马', 'zh')).toBe('骑乘马')
    expect(stripLocalizedTierName('禅师级梅斯', 'zh')).toBe('梅斯')
    expect(stripLocalizedTierName('宗师级重型梅斯', 'zh')).toBe('重型梅斯')
  })
})

describe('getLocalizedBaseItemName', () => {
  it('returns localized item names without repeated tier words', () => {
    expect(getLocalizedBaseItemName('T8_MAIN_MACE', 'ko', null)).toBe('메이스')
    expect(getLocalizedBaseItemName('T8_MAIN_MACE', 'en', null)).toBe('Mace')
    expect(getLocalizedBaseItemName('T7_MAIN_SPEAR', 'ko', null)).toBe('창')
    expect(getLocalizedBaseItemName('T8_HEAD_GATHERER_FISH', 'ko', null)).toBe('낚시꾼 모자')
    expect(getLocalizedBaseItemName('T7_2H_KNUCKLES_SET1', 'ko', null)).toBe('난투 장갑')
    expect(getLocalizedBaseItemName('T8_OFF_TORCH_CRYSTAL', 'ja', null)).toBe(
      '青い炎のたいまつ',
    )
  })
})
