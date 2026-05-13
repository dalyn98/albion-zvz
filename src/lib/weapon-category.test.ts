import { describe, expect, it } from 'vitest'
import { extractWeaponCategory } from './weapon-category'

// 도메인 invariant 화석화: 무기 사용 통계 카테고리 추출 (AGENTS.md #7).
// - 입력: Albion item ID (`T{tier}_{slot}_{CATEGORY}[_ARTIFACT][@{enchant}]`).
// - 출력: 대문자 카테고리 코드 (예: HOLYSTAFF). 통계 집계 키로 직접 쓰임.
// - artifact suffix 와 enchant 접미는 stripping — 같은 무기군으로 묶기 위함.
// - slot=2H/MAIN 만 매칭 (OFF/HEAD 등은 무기 아님 → null).

describe('extractWeaponCategory — Albion item ID → category code', () => {
  it('returns category from plain MAIN slot', () => {
    expect(extractWeaponCategory('T4_MAIN_SWORD')).toBe('SWORD')
  })

  it('returns category from 2H slot', () => {
    expect(extractWeaponCategory('T8_2H_HOLYSTAFF')).toBe('HOLYSTAFF')
  })

  it('strips @enchant suffix', () => {
    expect(extractWeaponCategory('T4_MAIN_SWORD@2')).toBe('SWORD')
    expect(extractWeaponCategory('T8_2H_HOLYSTAFF@4')).toBe('HOLYSTAFF')
  })

  it('strips artifact suffix to keep family stable', () => {
    // AGENTS.md #7: 같은 무기군을 카테고리로 묶는다. MORGANA/AVALON 변종도 base 와 동일.
    expect(extractWeaponCategory('T8_2H_HOLYSTAFF_MORGANA')).toBe('HOLYSTAFF')
    expect(extractWeaponCategory('T8_MAIN_SWORD_AVALON')).toBe('SWORD')
    expect(extractWeaponCategory('T8_2H_HOLYSTAFF_HELL')).toBe('HOLYSTAFF')
    expect(extractWeaponCategory('T8_MAIN_DAGGER_KEEPER')).toBe('DAGGER')
    expect(extractWeaponCategory('T8_2H_BOW_UNDEAD')).toBe('BOW')
    expect(extractWeaponCategory('T8_2H_SHAPESHIFTER_CRYSTAL')).toBe('SHAPESHIFTER')
    expect(extractWeaponCategory('T8_MAIN_AXE_DEMON')).toBe('AXE')
  })

  it('combines artifact + enchant strip in any order', () => {
    expect(extractWeaponCategory('T6_MAIN_HOLYSTAFF_AVALON@1')).toBe('HOLYSTAFF')
  })

  it('returns null for non-weapon slot (OFF/HEAD/ARMOR/etc.)', () => {
    // OFF/HEAD/ARMOR 는 regex 매칭 실패 → null. 통계에서 자동 제외.
    expect(extractWeaponCategory('T8_OFF_BOOK_AVALON')).toBeNull()
    expect(extractWeaponCategory('T7_HEAD_CLOTH_SET3')).toBeNull()
    expect(extractWeaponCategory('T7_ARMOR_CLOTH_SET3')).toBeNull()
    expect(extractWeaponCategory('T8_CAPEITEM_FW_LYMHURST')).toBeNull()
  })

  it('returns null for null/undefined/empty input', () => {
    expect(extractWeaponCategory(null)).toBeNull()
    expect(extractWeaponCategory(undefined)).toBeNull()
    expect(extractWeaponCategory('')).toBeNull()
  })

  it('only strips KNOWN artifact suffixes — unknown stays in category', () => {
    // CULTIST 같은 가상의 미등록 접미사는 그대로 카테고리에 포함. ARTIFACT_SUFFIXES
    // 목록이 진실의 원천 — 새 아티팩트 추가 시 이 테스트가 깨지면 의도된 갱신.
    expect(extractWeaponCategory('T8_MAIN_SWORD_CULTIST')).toBe('SWORD_CULTIST')
  })
})
