import { describe, expect, it } from 'vitest'
import {
  canApproveRegearParticipantStatus,
  isRegearParticipantConfirmationStatus,
} from './regear-participant-confirmation'

describe('regear participant confirmation', () => {
  it('allows approval only when confirmation is unnecessary or complete', () => {
    expect(canApproveRegearParticipantStatus('not_required')).toBe(true)
    expect(canApproveRegearParticipantStatus('confirmed')).toBe(true)
    expect(canApproveRegearParticipantStatus('awaiting_closeout')).toBe(false)
    expect(canApproveRegearParticipantStatus('excluded')).toBe(false)
  })

  it('rejects unknown persisted values', () => {
    expect(isRegearParticipantConfirmationStatus('awaiting_closeout')).toBe(true)
    expect(isRegearParticipantConfirmationStatus('pending')).toBe(false)
    expect(isRegearParticipantConfirmationStatus(null)).toBe(false)
  })
})
