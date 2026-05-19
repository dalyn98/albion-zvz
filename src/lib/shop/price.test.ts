import { describe, it, expect } from 'vitest'
import { computePointPrice, parseShopDiscountRate } from './price'

describe('computePointPrice', () => {
  describe('source selection: manualPrice vs autoPriceSilver', () => {
    it('prefers manualPrice when present', () => {
      expect(
        computePointPrice({
          manualPrice: 500_000,
          autoPriceSilver: 999_999,
          discountRate: 1,
        }),
      ).toBe(500_000)
    })

    it('falls back to autoPriceSilver when manualPrice is null', () => {
      expect(
        computePointPrice({
          manualPrice: null,
          autoPriceSilver: 1_000_000,
          discountRate: 1,
        }),
      ).toBe(1_000_000)
    })

    it('falls back to autoPriceSilver when manualPrice is undefined', () => {
      expect(
        computePointPrice({
          manualPrice: undefined,
          autoPriceSilver: 200_000,
          discountRate: 1,
        }),
      ).toBe(200_000)
    })

    it('accepts manualPrice of exactly 0 (free item)', () => {
      expect(
        computePointPrice({
          manualPrice: 0,
          autoPriceSilver: 999_999,
          discountRate: 0.5,
        }),
      ).toBe(0)
    })

    it('returns null when neither source is usable', () => {
      expect(
        computePointPrice({
          manualPrice: null,
          autoPriceSilver: null,
          discountRate: 1,
        }),
      ).toBeNull()
      expect(
        computePointPrice({
          manualPrice: undefined,
          autoPriceSilver: undefined,
          discountRate: 1,
        }),
      ).toBeNull()
    })

    it('rejects autoPriceSilver of 0 or negative (treated as missing)', () => {
      expect(
        computePointPrice({
          manualPrice: null,
          autoPriceSilver: 0,
          discountRate: 1,
        }),
      ).toBeNull()
      expect(
        computePointPrice({
          manualPrice: null,
          autoPriceSilver: -100,
          discountRate: 1,
        }),
      ).toBeNull()
    })

    it('rejects negative manualPrice (treated as missing → falls back to auto)', () => {
      expect(
        computePointPrice({
          manualPrice: -1,
          autoPriceSilver: 100_000,
          discountRate: 1,
        }),
      ).toBe(100_000)
    })
  })

  describe('discount rate application', () => {
    it('applies 50% discount (rate=0.5)', () => {
      expect(
        computePointPrice({
          manualPrice: null,
          autoPriceSilver: 1_000_000,
          discountRate: 0.5,
        }),
      ).toBe(500_000)
    })

    it('applies no discount (rate=1.0)', () => {
      expect(
        computePointPrice({
          manualPrice: 1_234,
          autoPriceSilver: null,
          discountRate: 1.0,
        }),
      ).toBe(1_234)
    })

    it('ceils fractional results (avoids selling cheaper than rate implies)', () => {
      // 3 × 0.5 = 1.5 → ceil = 2
      expect(
        computePointPrice({
          manualPrice: 3,
          autoPriceSilver: null,
          discountRate: 0.5,
        }),
      ).toBe(2)
    })

    it('falls back to rate=1 for NaN / Infinity / negative / zero', () => {
      const base = { manualPrice: null, autoPriceSilver: 1000 }
      expect(computePointPrice({ ...base, discountRate: Number.NaN })).toBe(1000)
      expect(computePointPrice({ ...base, discountRate: Number.POSITIVE_INFINITY })).toBe(1000)
      expect(computePointPrice({ ...base, discountRate: -0.5 })).toBe(1000)
      expect(computePointPrice({ ...base, discountRate: 0 })).toBe(1000)
    })

    it('does NOT clamp rate > 1 (markup is computePointPrice の책임 외 — parseShopDiscountRate 에서 막음)', () => {
      // 단위테스트 의도: 함수 내부는 rate 클램프하지 않고 곱셈만 한다.
      // 마크업 차단은 parseShopDiscountRate 입력 단에서.
      expect(
        computePointPrice({
          manualPrice: null,
          autoPriceSilver: 100,
          discountRate: 1.5,
        }),
      ).toBe(150)
    })
  })
})

describe('parseShopDiscountRate', () => {
  it('returns 1 for nullish or empty input', () => {
    expect(parseShopDiscountRate(null)).toBe(1)
    expect(parseShopDiscountRate(undefined)).toBe(1)
    expect(parseShopDiscountRate('')).toBe(1)
  })

  it('returns 1 for non-numeric strings', () => {
    expect(parseShopDiscountRate('abc')).toBe(1)
    expect(parseShopDiscountRate('half')).toBe(1)
  })

  it('returns 1 for zero or negative values', () => {
    expect(parseShopDiscountRate('0')).toBe(1)
    expect(parseShopDiscountRate('-0.5')).toBe(1)
    expect(parseShopDiscountRate('-1')).toBe(1)
  })

  it('returns 1 for non-finite values', () => {
    expect(parseShopDiscountRate('Infinity')).toBe(1)
    expect(parseShopDiscountRate('NaN')).toBe(1)
  })

  it('accepts valid rates within (0, 1]', () => {
    expect(parseShopDiscountRate('0.5')).toBe(0.5)
    expect(parseShopDiscountRate('0.25')).toBe(0.25)
    expect(parseShopDiscountRate('1')).toBe(1)
    expect(parseShopDiscountRate('1.0')).toBe(1)
  })

  it('clamps values > 1 down to 1 (prevents legacy markup misconfig)', () => {
    // 옛 "1포인트 = N실버" 설정값이 남아 있으면 마크업으로 오해돼 가격이 폭증.
    // 그 사고를 막기 위해 안전 클램프.
    expect(parseShopDiscountRate('1.5')).toBe(1)
    expect(parseShopDiscountRate('2')).toBe(1)
    expect(parseShopDiscountRate('1000')).toBe(1)
  })
})
