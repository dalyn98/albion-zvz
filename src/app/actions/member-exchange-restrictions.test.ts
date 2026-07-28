import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAP } from '@/lib/permissions'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  requireCapability: vi.fn(),
  logAdminAction: vi.fn(),
  publicActionError: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }))
vi.mock('@/lib/tenant', () => ({ getSessionGuildId: mocks.getSessionGuildId }))
vi.mock('@/lib/auth', () => ({ requireCapability: mocks.requireCapability }))
vi.mock('@/lib/admin-audit', () => ({ logAdminAction: mocks.logAdminAction }))
vi.mock('@/lib/public-action-error', () => ({ publicActionError: mocks.publicActionError }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))

import {
  clearMemberExchangeRestriction,
  setMemberExchangeRestriction,
} from './member-exchange-restrictions'

describe('member exchange restriction actions', () => {
  const rpc = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getSession.mockResolvedValue({
      discordId: 'officer-1',
      username: 'Officer',
      isAdmin: false,
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireCapability.mockResolvedValue({ rpc })
    mocks.logAdminAction.mockResolvedValue(undefined)
    mocks.publicActionError.mockResolvedValue('requestFailed')
    rpc.mockResolvedValue({ error: null })
  })

  it('requires the exchange approval capability and writes a tenant-scoped restriction', async () => {
    const blockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    await expect(setMemberExchangeRestriction({
      discordId: 'member-1',
      blockedUntil,
      reason: 'Manual officer review',
    })).resolves.toEqual({ ok: true })

    expect(mocks.requireCapability).toHaveBeenCalledWith(CAP.EXCHANGE_APPROVE)
    expect(rpc).toHaveBeenCalledWith('set_member_exchange_restriction', {
      p_guild_id: 'guild-1',
      p_discord_id: 'member-1',
      p_blocked_until: blockedUntil,
      p_reason: 'Manual officer review',
      p_actor: 'officer-1',
    })
    expect(mocks.logAdminAction).toHaveBeenCalledWith(expect.objectContaining({
      guildId: 'guild-1',
      action: 'member.exchange_restriction.set',
      targetDiscordId: 'member-1',
    }))
  })

  it('lifts only the selected tenant member restriction', async () => {
    await expect(clearMemberExchangeRestriction('member-1')).resolves.toEqual({ ok: true })

    expect(mocks.requireCapability).toHaveBeenCalledWith(CAP.EXCHANGE_APPROVE)
    expect(rpc).toHaveBeenCalledWith('clear_member_exchange_restriction', {
      p_guild_id: 'guild-1',
      p_discord_id: 'member-1',
    })
  })

  it('rejects invalid input before authentication or database access', async () => {
    await expect(setMemberExchangeRestriction({
      discordId: 'local:account-1',
      blockedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      reason: 'No-op',
    })).resolves.toEqual({ ok: false, code: 'invalidMember' })

    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.requireCapability).not.toHaveBeenCalled()
  })
})
