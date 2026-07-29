import { describe, expect, it } from 'vitest'
import { CAP } from './permissions'
import {
  isMemberSubject,
  resolveMemberDetailScopes,
  resolveMemberDirectoryState,
} from './member-profile-access'

describe('member profile access', () => {
  it('keeps only active, non-disputed guild avatars in the member directory', () => {
    expect(resolveMemberDirectoryState({
      hasGuildAvatar: true,
      withdrawnAt: null,
      identityTrustStatus: 'trusted',
    })).toBe('active')
    expect(resolveMemberDirectoryState({
      hasGuildAvatar: true,
      withdrawnAt: '2026-07-01T00:00:00.000Z',
    })).toBe('withdrawn')
    expect(resolveMemberDirectoryState({
      hasGuildAvatar: true,
      identityTrustStatus: 'disputed',
    })).toBe('identity_review')
    expect(resolveMemberDirectoryState({
      hasGuildAvatar: false,
      isGuest: true,
    })).toBe('guest')
    expect(resolveMemberDirectoryState({
      hasGuildAvatar: false,
      hasActiveRosterEntry: true,
    })).toBe('unlinked_roster')
  })

  it('does not turn activity or aggregate-stat access into private detail access', () => {
    const scopes = resolveMemberDetailScopes({
      viewerDiscordId: '111111111111111111',
      targetDiscordId: '222222222222222222',
      isMember: true,
      isAdmin: false,
      capabilities: (CAP.MEMBERS_VIEW | CAP.STATS_VIEW).toString(),
    })

    expect(scopes.activity).toBe(true)
    expect(scopes.finance).toBe(false)
    expect(scopes.regear).toBe(false)
    expect(scopes.compliance).toBe(false)
    expect(scopes.memberOperations).toBe(false)
    expect(scopes.identityOperations).toBe(false)
  })

  it('grants each private detail only to its work capability or the member', () => {
    const targetDiscordId = '222222222222222222'
    expect(resolveMemberDetailScopes({
      viewerDiscordId: '111111111111111111',
      targetDiscordId,
      isMember: false,
      isAdmin: false,
      capabilities: CAP.EXCHANGE_APPROVE.toString(),
    })).toMatchObject({ activity: true, finance: true, regear: false })
    expect(resolveMemberDetailScopes({
      viewerDiscordId: '111111111111111111',
      targetDiscordId,
      isMember: false,
      isAdmin: false,
      capabilities: CAP.REGEAR_APPROVE.toString(),
    })).toMatchObject({ activity: true, finance: false, regear: true })
    expect(resolveMemberDetailScopes({
      viewerDiscordId: '111111111111111111',
      targetDiscordId,
      isMember: false,
      isAdmin: false,
      capabilities: CAP.CONTENT_COMPLIANCE_MANAGE.toString(),
    })).toMatchObject({
      activity: true,
      finance: false,
      regear: false,
      compliance: true,
      memberOperations: false,
    })
    expect(resolveMemberDetailScopes({
      viewerDiscordId: targetDiscordId,
      targetDiscordId,
      isMember: true,
      isAdmin: false,
      capabilities: '0',
    })).toMatchObject({
      activity: true,
      finance: true,
      regear: true,
      compliance: true,
      memberOperations: true,
      identityOperations: true,
    })
  })

  it('accepts Discord and local member subjects but rejects direct-URL junk', () => {
    expect(isMemberSubject('123456789012345678')).toBe(true)
    expect(isMemberSubject('local:11111111-1111-4111-8111-111111111111')).toBe(true)
    expect(isMemberSubject('local:../other-tenant')).toBe(false)
    expect(isMemberSubject('../other-tenant')).toBe(false)
    expect(isMemberSubject('x'.repeat(129))).toBe(false)
  })
})
