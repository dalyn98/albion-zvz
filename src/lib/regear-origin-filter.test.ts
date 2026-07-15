import { describe, expect, it } from 'vitest'
import { getRegearOriginFilterSpec } from './regear-origin-filter'

describe('regear origin filter', () => {
  it('treats legacy null auto_generated rows as manual requests', () => {
    expect(getRegearOriginFilterSpec('manual')).toEqual({
      kind: 'or',
      expression: 'auto_generated.eq.false,auto_generated.is.null',
    })
  })

  it('keeps automatic requests strictly scoped to true', () => {
    expect(getRegearOriginFilterSpec('auto')).toEqual({
      kind: 'eq',
      value: true,
    })
  })

  it('does not add an origin predicate for the all view', () => {
    expect(getRegearOriginFilterSpec('all')).toBeNull()
  })
})
