import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  unstable_isUnrecognizedActionError: (error: unknown) =>
    typeof error === 'object' &&
    error !== null &&
    'marker' in error &&
    error.marker === 'unrecognized-action',
}))

import { getServerActionClientErrorMessage } from './server-action-client-error'

const messages = {
  expired: 'expired',
  fallback: 'fallback',
}

describe('getServerActionClientErrorMessage', () => {
  it('maps Next unrecognized server action errors to the expired message', () => {
    expect(getServerActionClientErrorMessage({ marker: 'unrecognized-action' }, messages)).toBe('expired')
  })

  it('maps server action not found errors to the expired message', () => {
    expect(getServerActionClientErrorMessage(new Error('Server Action "abc" was not found on the server'), messages))
      .toBe('expired')
  })

  it('keeps ordinary errors generic', () => {
    expect(getServerActionClientErrorMessage(new Error('database unavailable'), messages)).toBe('fallback')
  })
})
