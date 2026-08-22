import { describe, expect, it } from 'vitest'
import { matchesAlbionResourceException } from './albion-identity-resource-exception'

const binding = {
  guildId: 'guild-1',
  discordId: '839318087542636545',
  server: 'east' as const,
  playerId: 'player-1',
  playerName: 'ZeroToHeroCaller',
}

describe('Albion identity resource exception binding', () => {
  it('matches only the exact tenant, Discord account, server, and player ID', () => {
    expect(
      matchesAlbionResourceException(binding, {
        guildId: 'guild-1',
        discordId: '839318087542636545',
        server: 'east',
        playerId: 'player-1',
        trustStatus: 'claimed',
      }),
    ).toBe(true)
    expect(
      matchesAlbionResourceException(binding, {
        guildId: 'guild-1',
        discordId: '839318087542636545',
        server: 'east',
        playerId: 'player-2',
        trustStatus: 'claimed',
      }),
    ).toBe(false)
    expect(
      matchesAlbionResourceException(binding, {
        guildId: 'guild-2',
        discordId: '839318087542636545',
        server: 'east',
        playerId: 'player-1',
        trustStatus: 'claimed',
      }),
    ).toBe(false)
  })

  it('never overrides a revoked account link', () => {
    expect(
      matchesAlbionResourceException(binding, {
        guildId: 'guild-1',
        discordId: '839318087542636545',
        server: 'east',
        playerId: 'player-1',
        trustStatus: 'revoked',
      }),
    ).toBe(false)

    expect(
      matchesAlbionResourceException(binding, {
        guildId: 'guild-1',
        discordId: '839318087542636545',
        server: 'east',
        playerId: 'player-1',
        trustStatus: 'trusted',
        revokedAt: '2026-08-22T00:00:00.000Z',
      }),
    ).toBe(false)
  })
})
