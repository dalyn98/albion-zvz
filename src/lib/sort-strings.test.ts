import { describe, expect, it } from 'vitest'
import { compareIsoStringsDesc, compareStrings } from './sort-strings'

describe('compareStrings', () => {
  it('sorts strings deterministically with the pinned collator', () => {
    const names = ['Zed', 'alice', 'Bob']

    expect([...names].sort(compareStrings)).toEqual(['alice', 'Bob', 'Zed'])
  })
})

describe('compareIsoStringsDesc', () => {
  it('orders ISO timestamp strings newest first without runtime locale rules', () => {
    const timestamps = [
      '2026-01-01T00:00:00.000Z',
      '2026-06-01T12:00:00.000Z',
      '2025-12-31T23:59:59.000Z',
    ]

    expect([...timestamps].sort(compareIsoStringsDesc)).toEqual([
      '2026-06-01T12:00:00.000Z',
      '2026-01-01T00:00:00.000Z',
      '2025-12-31T23:59:59.000Z',
    ])
  })

  it('keeps equal timestamps stable for sort tie handling', () => {
    expect(compareIsoStringsDesc('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')).toBe(0)
  })
})
