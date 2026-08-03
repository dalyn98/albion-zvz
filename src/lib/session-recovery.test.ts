import { describe, expect, it } from 'vitest'
import type { SessionPayload } from '@/lib/session-verify'
import { canRecoverDiscordSession } from './session-recovery'

const signedSession: SessionPayload = {
  discordId: 'member-1',
  username: 'Member',
  avatar: null,
  isMember: true,
  isAdmin: false,
  isGuest: false,
  isBombSquadCaller: false,
  isLocalGuildAccount: false,
  isAllianceCandidate: false,
  canCreateEvents: false,
  eventCreatorCategories: [],
  eventScope: null,
  guildId: 'guild-1',
  capabilities: '0',
  issuedAt: 1,
}

describe('revoked session recovery eligibility', () => {
  it('recovers a signed Discord snapshot rejected by the revocation ledger', () => {
    expect(canRecoverDiscordSession({
      currentSession: null,
      signedSession,
      hostTenantId: 'guild-1',
    })).toBe(true)
  })

  it('does not refresh a session on another tenant host', () => {
    expect(canRecoverDiscordSession({
      currentSession: null,
      signedSession,
      hostTenantId: 'guild-2',
    })).toBe(false)
  })

  it.each([
    { isGuest: true, isMember: false },
    { isLocalGuildAccount: true, isMember: false },
  ])('does not broaden recovery to narrow account types', (overrides) => {
    expect(canRecoverDiscordSession({
      currentSession: null,
      signedSession: { ...signedSession, ...overrides },
      hostTenantId: 'guild-1',
    })).toBe(false)
  })

  it('does not refresh an already-current session', () => {
    expect(canRecoverDiscordSession({
      currentSession: signedSession,
      signedSession,
      hostTenantId: 'guild-1',
    })).toBe(false)
  })
})
