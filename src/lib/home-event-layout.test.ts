import { describe, expect, it } from 'vitest'
import { resolveHomeEventLayout } from './home-event-layout'

describe('home event collection layout', () => {
  it.each([1, 2])('uses a full-width list for %i visible events', (count) => {
    expect(resolveHomeEventLayout(count)).toBe('list')
  })

  it('uses a responsive grid once comparison becomes useful', () => {
    expect(resolveHomeEventLayout(3)).toBe('grid')
  })

  it('keeps the empty state out of the grid', () => {
    expect(resolveHomeEventLayout(0)).toBe('list')
  })
})
