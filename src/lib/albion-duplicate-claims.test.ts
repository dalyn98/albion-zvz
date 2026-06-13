import { describe, expect, it } from 'vitest'
import { buildTenantDuplicateAlbionClaimMap } from './albion-duplicate-claims'

describe('buildTenantDuplicateAlbionClaimMap', () => {
  it('maps a disputed tenant member to the prior active claimant for the same Albion player', () => {
    const duplicates = buildTenantDuplicateAlbionClaimMap({
      reviewMembers: [
        {
          discordId: '222',
          server: 'east',
          playerId: 'player-a',
          trustStatus: 'disputed',
          statusReason: 'duplicate_claim',
        },
      ],
      tenantLinks: [
        {
          discordId: '111',
          username: 'OldDiscord',
          server: 'east',
          playerId: 'player-a',
          trustStatus: 'trusted',
          revokedAt: null,
        },
        {
          discordId: '222',
          username: 'NewDiscord',
          server: 'east',
          playerId: 'player-a',
          trustStatus: 'disputed',
          revokedAt: null,
        },
      ],
    })

    expect(duplicates.get('222')).toEqual({
      discordId: '111',
      username: 'OldDiscord',
    })
  })

  it('ignores other tenants, other servers, revoked claims, and non-duplicate review rows', () => {
    const duplicates = buildTenantDuplicateAlbionClaimMap({
      reviewMembers: [
        {
          discordId: '222',
          server: 'east',
          playerId: 'player-a',
          trustStatus: 'disputed',
          statusReason: 'duplicate_claim',
        },
        {
          discordId: '333',
          server: 'east',
          playerId: 'player-b',
          trustStatus: 'roster_matched',
          statusReason: 'roster_match',
        },
      ],
      tenantLinks: [
        {
          discordId: '111',
          username: 'WrongServer',
          server: 'west',
          playerId: 'player-a',
          trustStatus: 'trusted',
          revokedAt: null,
        },
        {
          discordId: '444',
          username: 'Revoked',
          server: 'east',
          playerId: 'player-a',
          trustStatus: 'trusted',
          revokedAt: '2026-06-13T00:00:00.000Z',
        },
        {
          discordId: '555',
          username: 'Rejected',
          server: 'east',
          playerId: 'player-a',
          trustStatus: 'revoked',
          revokedAt: null,
        },
      ],
    })

    expect(duplicates.size).toBe(0)
  })
})
