import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  getSession: vi.fn(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: mocks.getAdminClient,
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
  signSession: vi.fn(),
  SESSION_COOKIE_NAME: 'user_session',
  cookieOptions: vi.fn(() => ({})),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}))

vi.mock('@/lib/oauth-state', () => ({
  signHopToken: vi.fn(),
}))

import { saveTenantAlbion } from './onboard'

function createTenantQuery() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: {
        id: 'tenant-1',
        discord_guild_id: 'discord-guild-1',
        created_by_discord_id: 'admin-1',
      },
    })),
  }
  return query
}

describe('saveTenantAlbion', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset()
    mocks.getSession.mockReset()
  })

  it('requires a selected Albion home guild during first setup', async () => {
    const tenantQuery = createTenantQuery()
    const from = vi.fn((table: string) => {
      if (table === 'tenants') return tenantQuery
      throw new Error(`unexpected table: ${table}`)
    })
    mocks.getAdminClient.mockReturnValue({ from })
    mocks.getSession.mockResolvedValue({ discordId: 'admin-1' })

    await expect(
      saveTenantAlbion({
        tenantId: 'tenant-1',
        server: 'west',
        homeGuildId: '',
        homeGuildName: '',
      }),
    ).resolves.toEqual({ error: 'homeGuildRequired' })
    expect(from).toHaveBeenCalledTimes(1)
  })
})
