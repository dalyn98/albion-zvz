import { describe, expect, it } from 'vitest'
import {
  POSTGRES_INT_MAX,
  isPostgresNonNegativeInt,
  isPostgresPositiveInt,
} from './postgres-int'

describe('postgres integer guards', () => {
  it('accepts only positive integers inside int4 range', () => {
    expect(isPostgresPositiveInt(1)).toBe(true)
    expect(isPostgresPositiveInt(POSTGRES_INT_MAX)).toBe(true)
    expect(isPostgresPositiveInt(0)).toBe(false)
    expect(isPostgresPositiveInt(1.5)).toBe(false)
    expect(isPostgresPositiveInt(POSTGRES_INT_MAX + 1)).toBe(false)
  })

  it('accepts zero only for non-negative integer inputs', () => {
    expect(isPostgresNonNegativeInt(0)).toBe(true)
    expect(isPostgresNonNegativeInt(POSTGRES_INT_MAX)).toBe(true)
    expect(isPostgresNonNegativeInt(-1)).toBe(false)
    expect(isPostgresNonNegativeInt(POSTGRES_INT_MAX + 1)).toBe(false)
  })
})
