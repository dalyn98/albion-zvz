import { describe, expect, it } from 'vitest'
import { resolveDiscordRoleDisplayName } from './discord-role-display'

describe('resolveDiscordRoleDisplayName', () => {
  it('uses the current Discord role name instead of a migrated ID snapshot', () => {
    expect(
      resolveDiscordRoleDisplayName({
        roleId: '123456789012345678',
        liveRoleName: 'Guild Officer',
        storedRoleName: '123456789012345678',
      }),
    ).toBe('Guild Officer')
  })

  it('keeps a valid stored role name when the Discord role is unavailable', () => {
    expect(
      resolveDiscordRoleDisplayName({
        roleId: '123456789012345678',
        storedRoleName: 'Former Officer',
      }),
    ).toBe('Former Officer')
  })

  it('never falls back to a raw Discord role ID', () => {
    expect(
      resolveDiscordRoleDisplayName({
        roleId: '123456789012345678',
        storedRoleName: '123456789012345678',
      }),
    ).toBeNull()
  })
})
