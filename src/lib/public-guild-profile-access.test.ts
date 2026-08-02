import { describe, expect, it } from 'vitest'
import { resolvePublicGuildProfileAccessState } from './public-guild-profile-access'

describe('resolvePublicGuildProfileAccessState', () => {
  it('keeps profile publication separate from tenant activation', () => {
    expect(resolvePublicGuildProfileAccessState('active', false)).toBe('private')
    expect(resolvePublicGuildProfileAccessState('active', true)).toBe('public')
  })

  it('hides an active profile only after an operator starts dispute review', () => {
    expect(resolvePublicGuildProfileAccessState('active', true, false)).toBe('public')
    expect(resolvePublicGuildProfileAccessState('active', true, true)).toBe('under_review')
  })

  it('never publishes pending, suspended, or deleted tenants', () => {
    expect(resolvePublicGuildProfileAccessState('pending', true)).toBe('pending')
    expect(resolvePublicGuildProfileAccessState('suspended', true)).toBe('missing')
    expect(resolvePublicGuildProfileAccessState('deleted', true)).toBe('missing')
    expect(resolvePublicGuildProfileAccessState(null, true)).toBe('missing')
  })
})
