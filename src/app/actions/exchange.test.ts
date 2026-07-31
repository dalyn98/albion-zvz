import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  getAdminClient: vi.fn(),
  requireAlbionVerified: vi.fn(),
  getMemberSpendablePointBalance: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/albion-identity', () => ({
  requireAlbionVerified: mocks.requireAlbionVerified,
}))

vi.mock('@/lib/point-ledger', () => ({
  getMemberSpendablePointBalance: mocks.getMemberSpendablePointBalance,
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

import { requestExchange } from './exchange'

describe('requestExchange local account boundary', () => {
  beforeEach(() => {
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.getAdminClient.mockReset()
    mocks.requireAlbionVerified.mockReset()
    mocks.getMemberSpendablePointBalance.mockReset()
    mocks.revalidatePath.mockReset()
  })

  it('blocks guild-local Albion accounts before resource balance or identity checks run', async () => {
    mocks.getSession.mockResolvedValue({
      discordId: 'local:account-1',
      username: 'Local Player',
      isMember: true,
      isAdmin: false,
      isGuest: false,
      isLocalGuildAccount: true,
    })

    await expect(requestExchange(1000)).resolves.toEqual({
      error: 'localAccountResourceBlocked',
    })
    expect(mocks.getSessionGuildId).not.toHaveBeenCalled()
    expect(mocks.requireAlbionVerified).not.toHaveBeenCalled()
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it('rejects amounts outside postgres integer range before identity checks run', async () => {
    mocks.getSession.mockResolvedValue({
      discordId: 'member-1',
      username: 'Member',
      isMember: true,
      isLocalGuildAccount: false,
    })

    await expect(requestExchange(2147483648)).resolves.toEqual({
      error: 'invalidAmount',
    })

    expect(mocks.getSessionGuildId).not.toHaveBeenCalled()
    expect(mocks.requireAlbionVerified).not.toHaveBeenCalled()
    expect(mocks.getAdminClient).not.toHaveBeenCalled()
  })

  it('maps the database restriction guard to a member-safe error', async () => {
    mocks.getSession.mockResolvedValue({
      discordId: 'member-1',
      username: 'Member',
      isMember: true,
      isLocalGuildAccount: false,
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireAlbionVerified.mockResolvedValue(null)
    mocks.getMemberSpendablePointBalance.mockResolvedValue({
      spendable: 1000,
      error: null,
    })
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'EXCHANGE_TEMPORARILY_RESTRICTED:2026-07-29T00:00:00Z' },
    })
    mocks.getAdminClient.mockReturnValue({ rpc })

    await expect(requestExchange(100)).resolves.toEqual({
      error: 'exchangeTemporarilyRestricted',
    })
    expect(rpc).toHaveBeenCalledWith('submit_exchange_request', {
      p_guild_id: 'guild-1',
      p_discord_id: 'member-1',
      p_username: 'Member',
      p_silver: 100,
    })
  })

  it('maps the five-day gameplay-video guard to a member-safe error', async () => {
    mocks.getSession.mockResolvedValue({
      discordId: 'member-1',
      username: 'Member',
      isMember: true,
      isLocalGuildAccount: false,
    })
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.requireAlbionVerified.mockResolvedValue(null)
    mocks.getMemberSpendablePointBalance.mockResolvedValue({
      spendable: 1000,
      error: null,
    })
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'EXCHANGE_RECENT_GAMEPLAY_VIDEO_REQUIRED' },
    })
    mocks.getAdminClient.mockReturnValue({ rpc })

    await expect(requestExchange(100)).resolves.toEqual({
      error: 'exchangeRecentGameplayVideoRequired',
    })
    expect(rpc).toHaveBeenCalledWith('submit_exchange_request', {
      p_guild_id: 'guild-1',
      p_discord_id: 'member-1',
      p_username: 'Member',
      p_silver: 100,
    })
  })
})
