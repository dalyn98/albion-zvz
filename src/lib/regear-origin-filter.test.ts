import { describe, expect, it } from 'vitest'
import { getRegearOriginFilterSpec } from './regear-origin-filter'

describe('regear origin filter', () => {
  it('filters regular event requests by their stable origin', () => {
    expect(getRegearOriginFilterSpec('event')).toEqual({
      kind: 'eq',
      value: 'event',
    })
  })

  it('filters free-window requests independently from events', () => {
    expect(getRegearOriginFilterSpec('free_window')).toEqual({
      kind: 'eq',
      value: 'free_window',
    })
  })

  it('keeps automatic requests strictly scoped to their stable origin', () => {
    expect(getRegearOriginFilterSpec('auto')).toEqual({
      kind: 'eq',
      value: 'auto',
    })
  })

  it('does not add an origin predicate for the all view', () => {
    expect(getRegearOriginFilterSpec('all')).toBeNull()
  })
})
