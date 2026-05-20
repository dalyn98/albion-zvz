import { describe, expect, it } from 'vitest'
import { resolveTenantLoginAccess } from './tenant-login-access'
import type { DiscordIdentity } from './discord'

const identity = (patch: Partial<DiscordIdentity>): DiscordIdentity => ({
  discordId: 'user-1',
  username: 'User',
  avatar: null,
  isMember: false,
  isAdmin: false,
  ...patch,
})

describe('resolveTenantLoginAccess', () => {
  it('keeps a tenant owner as admin even when Discord role mapping no longer matches', () => {
    expect(
      resolveTenantLoginAccess({
        identity: identity({ isMember: false, isAdmin: false }),
        hasAdminOverride: false,
        isTenantOwner: true,
      }),
    ).toEqual({ isMember: true, isAdmin: true })
  })

  it('keeps support overrides as admin without a Discord admin role', () => {
    expect(
      resolveTenantLoginAccess({
        identity: identity({ isMember: false, isAdmin: false }),
        hasAdminOverride: true,
        isTenantOwner: false,
      }),
    ).toEqual({ isMember: true, isAdmin: true })
  })

  it('preserves ordinary role-based member access', () => {
    expect(
      resolveTenantLoginAccess({
        identity: identity({ isMember: true, isAdmin: false }),
        hasAdminOverride: false,
        isTenantOwner: false,
      }),
    ).toEqual({ isMember: true, isAdmin: false })
  })

  it('does not grant access when no identity, owner, or override exists', () => {
    expect(
      resolveTenantLoginAccess({
        identity: null,
        hasAdminOverride: false,
        isTenantOwner: false,
      }),
    ).toEqual({ isMember: false, isAdmin: false })
  })
})
