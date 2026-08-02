import { describe, expect, it, vi } from 'vitest'
import {
  accessIdentityType,
  isSameStableMemberOwner,
  resolveStableMemberOwnership,
} from './stable-member-ownership'

describe('stable member ownership adapter', () => {
  it('uses the exact access identity type when resolving a tenant member', async () => {
    const rpc = vi.fn(async () => ({ data: 'member-1', error: null }))
    await expect(resolveStableMemberOwnership(
      { rpc } as never,
      'guild-1',
      'local:account-1',
    )).resolves.toEqual({ guildMemberId: 'member-1' })
    expect(accessIdentityType('local:account-1')).toBe('local')
    expect(accessIdentityType('899999999999999999')).toBe('discord')
    expect(rpc).toHaveBeenCalledWith('resolve_guild_member_id', {
      p_guild_id: 'guild-1',
      p_identity_type: 'local',
      p_subject_id: 'local:account-1',
    })
  })

  it('prefers stable ownership and only falls back for unresolved legacy rows', () => {
    expect(isSameStableMemberOwner({
      currentGuildMemberId: 'member-1',
      currentSubjectId: 'discord-new',
      rowGuildMemberId: 'member-1',
      rowSubjectId: 'local:old',
    })).toBe(true)
    expect(isSameStableMemberOwner({
      currentGuildMemberId: 'member-1',
      currentSubjectId: 'discord-new',
      rowGuildMemberId: 'member-2',
      rowSubjectId: 'discord-new',
    })).toBe(false)
    expect(isSameStableMemberOwner({
      currentGuildMemberId: null,
      currentSubjectId: 'legacy-owner',
      rowGuildMemberId: null,
      rowSubjectId: 'legacy-owner',
    })).toBe(true)
  })
})
