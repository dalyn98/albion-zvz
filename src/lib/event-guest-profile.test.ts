import { describe, expect, it } from 'vitest'
import { normalizeEventGuestDisplayName } from './event-guest-profile'

describe('normalizeEventGuestDisplayName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeEventGuestDisplayName('  Albion   Guest  ').value).toBe('Albion Guest')
  })

  it('requires a usable 2-32 character display name', () => {
    expect(normalizeEventGuestDisplayName('').error).toBe('name_required')
    expect(normalizeEventGuestDisplayName('A').error).toBe('name_too_short')
    expect(normalizeEventGuestDisplayName('A'.repeat(33)).error).toBe('name_too_long')
  })
})
