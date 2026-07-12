import { describe, expect, it } from 'vitest'
import { resolveHomeEventMyStatus } from './home-event-status'

const empty = {
  hasAssignedSlot: false,
  hasPendingSlot: false,
  hasTentativeSignup: false,
  hasAvailableSlot: false,
}

describe('resolveHomeEventMyStatus', () => {
  it('prioritizes a confirmed slot over stale lower-priority signup records', () => {
    expect(
      resolveHomeEventMyStatus({
        ...empty,
        hasAssignedSlot: true,
        hasPendingSlot: true,
        hasTentativeSignup: true,
        hasAvailableSlot: true,
      }),
    ).toBe('assigned')
  })

  it('keeps a pending slot ahead of a tentative signup', () => {
    expect(
      resolveHomeEventMyStatus({
        ...empty,
        hasPendingSlot: true,
        hasTentativeSignup: true,
        hasAvailableSlot: true,
      }),
    ).toBe('pending')
  })

  it('shows an existing tentative signup before an open slot', () => {
    expect(
      resolveHomeEventMyStatus({ ...empty, hasTentativeSignup: true, hasAvailableSlot: true }),
    ).toBe('tentative')
  })

  it('only advertises signup when an open visible slot exists', () => {
    expect(resolveHomeEventMyStatus({ ...empty, hasAvailableSlot: true })).toBe('available')
    expect(resolveHomeEventMyStatus(empty)).toBeNull()
  })
})
