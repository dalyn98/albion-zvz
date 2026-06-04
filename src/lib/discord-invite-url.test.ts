import { describe, expect, it } from 'vitest'
import { toDiscordInviteUrl } from './discord-invite-url'

describe('toDiscordInviteUrl', () => {
  it('accepts Discord invite URL forms and normalizes them to HTTPS short links', () => {
    expect(toDiscordInviteUrl('https://discord.gg/demo-guild')).toBe(
      'https://discord.gg/demo-guild',
    )
    expect(toDiscordInviteUrl('http://discord.gg/AbC_123')).toBe(
      'https://discord.gg/AbC_123',
    )
    expect(toDiscordInviteUrl('https://discord.com/invite/demo-guild?utm=ignored')).toBe(
      'https://discord.gg/demo-guild',
    )
    expect(toDiscordInviteUrl('https://discordapp.com/invite/demo-guild')).toBe(
      'https://discord.gg/demo-guild',
    )
  })

  it('rejects non-Discord hosts, non-invite Discord paths, and unsafe schemes', () => {
    expect(toDiscordInviteUrl('')).toBeNull()
    expect(toDiscordInviteUrl('not a url')).toBeNull()
    expect(toDiscordInviteUrl('javascript:alert(1)')).toBeNull()
    expect(toDiscordInviteUrl('https://discord.gg.evil.test/demo-guild')).toBeNull()
    expect(toDiscordInviteUrl('https://discord.com/channels/123/456')).toBeNull()
    expect(toDiscordInviteUrl('https://discord.gg/demo-guild/extra')).toBeNull()
    expect(toDiscordInviteUrl('https://discord.gg/%0Ajavascript')).toBeNull()
  })
})
