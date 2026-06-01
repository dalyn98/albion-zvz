import { describe, expect, it } from 'vitest'
import { moveFilterValue, orderedFilterValues } from './filter-order'

describe('filter-order', () => {
  it('uses a saved order first and appends missing default values', () => {
    expect(
      orderedFilterValues(['auto', 'manual', 'all'], ['all', 'auto']),
    ).toEqual(['all', 'auto', 'manual'])
  })

  it('ignores unknown and duplicate saved values', () => {
    expect(
      orderedFilterValues(['pending', 'all'], ['banana', 'all', 'all', 'pending']),
    ).toEqual(['all', 'pending'])
  })

  it('moves a value earlier or later without mutating the input order', () => {
    const order = ['auto', 'manual', 'all'] as const

    expect(moveFilterValue(order, 'all', 'earlier')).toEqual(['auto', 'all', 'manual'])
    expect(moveFilterValue(order, 'auto', 'later')).toEqual(['manual', 'auto', 'all'])
    expect(order).toEqual(['auto', 'manual', 'all'])
  })

  it('keeps boundary moves stable', () => {
    expect(moveFilterValue(['auto', 'manual'], 'auto', 'earlier')).toEqual(['auto', 'manual'])
    expect(moveFilterValue(['auto', 'manual'], 'manual', 'later')).toEqual(['auto', 'manual'])
  })
})
