import { describe, expect, it } from 'vitest'
import {
  parseBoundedInt,
  parseNonNegativeSafeInt,
  parsePositiveSafeInt,
} from './parse-bounded-int'

describe('parseBoundedInt', () => {
  it('accepts decimal integers and clamps them to the configured range', () => {
    expect(parseBoundedInt('25', 1, 100)).toBe(25)
    expect(parseBoundedInt('0', 1, 100)).toBe(1)
    expect(parseBoundedInt('500', 1, 100)).toBe(100)
  })

  it('rejects malformed numeric-looking values instead of prefix parsing them', () => {
    expect(parseBoundedInt('25abc', 1, 100)).toBeNull()
    expect(parseBoundedInt('1.5', 1, 100)).toBeNull()
    expect(parseBoundedInt('0x10', 1, 100)).toBeNull()
    expect(parseBoundedInt('1e2', 1, 100)).toBeNull()
  })

  it('treats missing or blank values as absent', () => {
    expect(parseBoundedInt(null, 1, 100)).toBeNull()
    expect(parseBoundedInt(undefined, 1, 100)).toBeNull()
    expect(parseBoundedInt(' ', 1, 100)).toBeNull()
  })
})

describe('parsePositiveSafeInt', () => {
  it('accepts only positive decimal integer strings', () => {
    expect(parsePositiveSafeInt('123')).toBe(123)
    expect(parsePositiveSafeInt(' 123 ')).toBe(123)
  })

  it('rejects malformed numeric-looking values instead of coercing them', () => {
    expect(parsePositiveSafeInt('123.9')).toBeNull()
    expect(parsePositiveSafeInt('123abc')).toBeNull()
    expect(parsePositiveSafeInt('1e5')).toBeNull()
    expect(parsePositiveSafeInt('0x10')).toBeNull()
  })

  it('rejects zero, negative, blank, and unsafe values', () => {
    expect(parsePositiveSafeInt('0')).toBeNull()
    expect(parsePositiveSafeInt('-1')).toBeNull()
    expect(parsePositiveSafeInt('')).toBeNull()
    expect(parsePositiveSafeInt(String(Number.MAX_SAFE_INTEGER + 1))).toBeNull()
  })
})

describe('parseNonNegativeSafeInt', () => {
  it('accepts zero and positive decimal integer strings', () => {
    expect(parseNonNegativeSafeInt('0')).toBe(0)
    expect(parseNonNegativeSafeInt('123')).toBe(123)
    expect(parseNonNegativeSafeInt(' 123 ')).toBe(123)
  })

  it('rejects malformed, negative, blank, and unsafe values', () => {
    expect(parseNonNegativeSafeInt('123abc')).toBeNull()
    expect(parseNonNegativeSafeInt('1.5')).toBeNull()
    expect(parseNonNegativeSafeInt('-1')).toBeNull()
    expect(parseNonNegativeSafeInt('')).toBeNull()
    expect(parseNonNegativeSafeInt(String(Number.MAX_SAFE_INTEGER + 1))).toBeNull()
  })
})
