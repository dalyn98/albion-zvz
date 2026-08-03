import { describe, expect, it } from 'vitest'
import { formatDiscordChannelLabel } from './discord-channel-label'

describe('formatDiscordChannelLabel', () => {
  it('includes the Discord category when one is available', () => {
    expect(formatDiscordChannelLabel({ name: 'announcements', parentName: 'Operations' }))
      .toBe('Operations / #announcements')
  })

  it('keeps uncategorized channels concise', () => {
    expect(formatDiscordChannelLabel({ name: 'general', parentName: null }))
      .toBe('#general')
  })
})
