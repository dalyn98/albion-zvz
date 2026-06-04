import { describe, expect, it } from 'vitest'
import { discordAvatarUrl } from './discord-avatar-url'

describe('discordAvatarUrl', () => {
  it('builds Discord CDN avatar URLs with a valid rounded CDN size', () => {
    expect(discordAvatarUrl('123', 'avatar-hash', 36)).toBe(
      'https://cdn.discordapp.com/avatars/123/avatar-hash.png?size=64',
    )
  })

  it('uses gif for animated Discord avatars', () => {
    expect(discordAvatarUrl('123', 'a_animated', 128)).toBe(
      'https://cdn.discordapp.com/avatars/123/a_animated.gif?size=128',
    )
  })

  it('returns null when no avatar hash is available', () => {
    expect(discordAvatarUrl('123', null)).toBeNull()
    expect(discordAvatarUrl('123', undefined)).toBeNull()
  })
})
