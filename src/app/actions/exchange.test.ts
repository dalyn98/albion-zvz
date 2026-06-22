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
})
