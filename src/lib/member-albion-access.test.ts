import { describe, expect, it } from 'vitest'
import { isAlbionMemberVerificationSubject } from './member-albion-access'

describe('isAlbionMemberVerificationSubject', () => {
  it('applies ordinary Albion verification to Discord members', () => {
    expect(
      isAlbionMemberVerificationSubject({
        isMember: true,
        isLocalGuildAccount: false,
      }),
    ).toBe(true)
  })

  it('does not send local guild accounts through Discord-member onboarding again', () => {
    expect(
      isAlbionMemberVerificationSubject({
        isMember: true,
        isLocalGuildAccount: true,
      }),
    ).toBe(false)
  })

  it('does not apply the member verification gate to non-members', () => {
    expect(isAlbionMemberVerificationSubject({ isMember: false })).toBe(false)
    expect(isAlbionMemberVerificationSubject(null)).toBe(false)
  })
})
