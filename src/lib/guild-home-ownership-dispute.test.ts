import { describe, expect, it } from 'vitest'
import {
  doesOwnershipDisputeHidePublicSurface,
  isGuildHomeOwnershipReviewAction,
} from './guild-home-ownership-dispute'

describe('guild home ownership dispute policy', () => {
  it('does not suspend public surfaces from an unreviewed report', () => {
    expect(doesOwnershipDisputeHidePublicSurface('submitted')).toBe(false)
    expect(doesOwnershipDisputeHidePublicSurface('under_review')).toBe(true)
    expect(doesOwnershipDisputeHidePublicSurface('rejected')).toBe(false)
    expect(doesOwnershipDisputeHidePublicSurface('resolved_existing')).toBe(false)
  })

  it('accepts only the explicit operator actions', () => {
    expect(isGuildHomeOwnershipReviewAction('start_review')).toBe(true)
    expect(isGuildHomeOwnershipReviewAction('reassign')).toBe(true)
    expect(isGuildHomeOwnershipReviewAction('auto_suspend')).toBe(false)
  })
})
