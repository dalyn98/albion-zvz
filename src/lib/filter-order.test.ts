import { describe, expect, it } from 'vitest'
import {
  firstOrderedFilterValue,
  getInitialFilterHref,
  moveFilterValue,
  orderedFilterValues,
  parseStoredFilterOrder,
} from './filter-order'

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

  it('parses URI-encoded stored order values', () => {
    expect(parseStoredFilterOrder(encodeURIComponent(JSON.stringify(['all', 'auto'])))).toEqual([
      'all',
      'auto',
    ])
  })

  it('gets the first valid ordered filter value from stored data', () => {
    expect(
      firstOrderedFilterValue(['auto', 'manual', 'all'], JSON.stringify(['all', 'manual'])),
    ).toBe('all')
    expect(firstOrderedFilterValue(['auto', 'manual'], 'not-json')).toBe('auto')
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

  it('returns the first stored filter href when the filter query param is absent', () => {
    expect(
      getInitialFilterHref({
        activeValue: 'auto',
        queryParam: 'origin',
        search: '',
        items: [
          { value: 'all', href: '/admin/dashboard/approvals?origin=all' },
          { value: 'auto', href: '/admin/dashboard/approvals' },
          { value: 'manual', href: '/admin/dashboard/approvals?origin=manual' },
        ],
      }),
    ).toBe('/admin/dashboard/approvals?origin=all')
  })

  it('does not return an initial href when the filter query param is explicit', () => {
    expect(
      getInitialFilterHref({
        activeValue: 'auto',
        queryParam: 'origin',
        search: '?origin=auto',
        items: [
          { value: 'all', href: '/admin/dashboard/approvals?origin=all' },
          { value: 'auto', href: '/admin/dashboard/approvals' },
        ],
      }),
    ).toBeNull()
  })

  it('does not return an initial href when the first filter is already active', () => {
    expect(
      getInitialFilterHref({
        activeValue: 'pending',
        queryParam: 'scope',
        search: '',
        items: [
          { value: 'pending', href: '/admin/dashboard/approvals' },
          { value: 'all', href: '/admin/dashboard/approvals?scope=all' },
        ],
      }),
    ).toBeNull()
  })

  it('preserves other explicit query params when applying the first filter href', () => {
    expect(
      getInitialFilterHref({
        activeValue: 'pending',
        queryParam: 'scope',
        search: '?origin=auto',
        items: [
          { value: 'all', href: '/demo/regear?scope=all' },
          { value: 'pending', href: '/demo/regear' },
        ],
      }),
    ).toBe('/demo/regear?origin=auto&scope=all')
  })
})
