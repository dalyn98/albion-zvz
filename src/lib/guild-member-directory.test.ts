import { describe, expect, it } from 'vitest'
import { resolveGuildMemberDirectoryDisplayName } from './guild-member-directory'

describe('guild member directory display name', () => {
  it('prefers a guild-scoped override over mutable external names', () => {
    expect(
      resolveGuildMemberDirectoryDisplayName({
        displayNameOverride: '  Operator label  ',
        albionPlayerName: 'AlbionName',
        displayNameSnapshot: 'JoinedAs',
        discordDisplayName: 'DiscordName',
      }),
    ).toBe('Operator label')
  })

  it('falls back through active character, join snapshot, then Discord', () => {
    expect(
      resolveGuildMemberDirectoryDisplayName({
        displayNameOverride: ' ',
        albionPlayerName: 'AlbionName',
        displayNameSnapshot: 'JoinedAs',
        discordDisplayName: 'DiscordName',
      }),
    ).toBe('AlbionName')
    expect(
      resolveGuildMemberDirectoryDisplayName({
        albionPlayerName: null,
        displayNameSnapshot: 'JoinedAs',
        discordDisplayName: 'DiscordName',
      }),
    ).toBe('JoinedAs')
    expect(
      resolveGuildMemberDirectoryDisplayName({
        discordDisplayName: 'DiscordName',
      }),
    ).toBe('DiscordName')
  })
})
