import { describe, expect, it } from 'vitest'
import { resolvePublicGuildProfileAccessState } from './public-guild-profile-access'

describe('resolvePublicGuildProfileAccessState', () => {
  it('keeps profile publication separate from tenant activation', () => {
    expect(resolvePublicGuildProfileAccessState('active', false)).toBe('private')
    expect(resolvePublicGuildProfileAccessState('active', true)).toBe('public')
  })

  it('never publishes pending, suspended, or deleted tenants', () => {
    expect(resolvePublicGuildProfileAccessState('pending', true)).toBe('pending')
    expect(resolvePublicGuildProfileAccessState('suspended', true)).toBe('missing')
    expect(resolvePublicGuildProfileAccessState('deleted', true)).toBe('missing')
    expect(resolvePublicGuildProfileAccessState(null, true)).toBe('missing')
  })
})
