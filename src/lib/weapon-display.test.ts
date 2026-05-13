import { describe, expect, it } from 'vitest'
import { canonicalT8WeaponId, stripTierPrefix } from './weapon-display'

// 도메인 invariant 화석화: 무기 표시/정규화 헬퍼.
// - stripTierPrefix: 한글 로컬라이즈된 '장로의 ' (T8) 접두 제거 — 리스트 시각 노이즈 감소.
// - canonicalT8WeaponId: 인챈트 변종 (T6_..@1) 을 items.json 룩업 가능한 T8 base 로 정규화.
//   저장값은 그대로 유지 (id), 표시할 때만 정규화.

describe('stripTierPrefix — 한글 라벨에서 "장로의 " 접두 제거', () => {
  it('removes "장로의 " prefix when present', () => {
    expect(stripTierPrefix('장로의 신성한 지팡이')).toBe('신성한 지팡이')
  })

  it('returns original string when prefix is absent', () => {
    expect(stripTierPrefix('신성한 지팡이')).toBe('신성한 지팡이')
    expect(stripTierPrefix('Holy Staff')).toBe('Holy Staff')
  })

  it('returns empty string for null/undefined/empty', () => {
    expect(stripTierPrefix(null)).toBe('')
    expect(stripTierPrefix(undefined)).toBe('')
    expect(stripTierPrefix('')).toBe('')
  })

  it('only strips at the start (not mid-string)', () => {
    // "장로의 " 가 문자열 중간에 있으면 보존 — 의도된 prefix 정의.
    expect(stripTierPrefix('상위 장로의 지팡이')).toBe('상위 장로의 지팡이')
  })
})

describe('canonicalT8WeaponId — 인챈트/티어 변종 → T8 base 정규화', () => {
  it('normalizes lower-tier MAIN slot to T8 base', () => {
    expect(canonicalT8WeaponId('T6_MAIN_HOLYSTAFF_AVALON@1')).toBe('T8_MAIN_HOLYSTAFF_AVALON')
  })

  it('normalizes lower-tier 2H slot to T8 base', () => {
    expect(canonicalT8WeaponId('T7_2H_HOLYSTAFF@3')).toBe('T8_2H_HOLYSTAFF')
  })

  it('preserves base form when input is already T8.0', () => {
    expect(canonicalT8WeaponId('T8_2H_HOLYSTAFF')).toBe('T8_2H_HOLYSTAFF')
  })

  it('returns null for non-weapon slots', () => {
    expect(canonicalT8WeaponId('T8_OFF_BOOK_AVALON')).toBeNull()
    expect(canonicalT8WeaponId('T7_HEAD_CLOTH_SET3')).toBeNull()
  })

  it('returns null for null/undefined/empty', () => {
    expect(canonicalT8WeaponId(null)).toBeNull()
    expect(canonicalT8WeaponId(undefined)).toBeNull()
    expect(canonicalT8WeaponId('')).toBeNull()
  })
})
