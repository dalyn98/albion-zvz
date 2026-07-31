import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  withCronRun: vi.fn(),
  getDiscordGuild: vi.fn(),
  listActiveTenants: vi.fn(),
  processDueTenantPurges: vi.fn(),
  revalidateTenantDirectoryCache: vi.fn(),
}))

vi.mock('@/lib/cron-run', () => ({
  withCronRun: mocks.withCronRun,
}))
vi.mock('@/lib/discord', () => ({
  getDiscordGuild: mocks.getDiscordGuild,
}))
vi.mock('@/lib/tenant', () => ({
  listActiveTenants: mocks.listActiveTenants,
}))
vi.mock('@/lib/tenant-lifecycle-purge', () => ({
  processDueTenantPurges: mocks.processDueTenantPurges,
}))
vi.mock('@/lib/tenant-cache', () => ({
  revalidateTenantDirectoryCache:
    mocks.revalidateTenantDirectoryCache,
}))
vi.mock('@/lib/log', () => ({
  log: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import { GET } from './route'

describe('tenant lifecycle cron', () => {
  const rpc = vi.fn()
  const db = { rpc }

  beforeEach(() => {
    vi.clearAllMocks()
    mocks.withCronRun.mockImplementation(
      async (
        _request: Request,
        _options: unknown,
        handler: (context: { db: typeof db }) => Promise<Response>,
      ) => handler({ db }),
    )
    mocks.processDueTenantPurges.mockResolvedValue({
      claimed: 0,
      purged: 0,
      failed: 0,
      storageObjectsRemoved: 0,
    })
  })

  it('suspends only a definite Discord 404 and preserves transient failures', async () => {
    mocks.listActiveTenants.mockResolvedValue([
      {
        id: 'tenant-present',
        discordGuildId: 'discord-present',
        botInstalled: true,
      },
      {
        id: 'tenant-missing',
        discordGuildId: 'discord-missing',
        botInstalled: true,
      },
      {
        id: 'tenant-transient',
        discordGuildId: 'discord-transient',
        botInstalled: true,
      },
      {
        id: 'tenant-uninstalled',
        discordGuildId: 'discord-uninstalled',
        botInstalled: false,
      },
    ])
    mocks.getDiscordGuild
      .mockResolvedValueOnce({ id: 'discord-present', name: 'Present' })
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('Discord rate limited'))
    rpc.mockResolvedValueOnce({ data: true, error: null })

    const request = new Request(
      'https://example.test/api/cron/tenant-lifecycle',
    )
    const response = await GET(request)

    expect(mocks.withCronRun).toHaveBeenCalledWith(
      request,
      { jobName: 'tenant-lifecycle', leaseSeconds: 600 },
      expect.any(Function),
    )
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith(
      'suspend_tenant_for_bot_removal',
      expect.objectContaining({ p_guild_id: 'tenant-missing' }),
    )
    expect(mocks.processDueTenantPurges).toHaveBeenCalledWith(db)
    await expect(response.json()).resolves.toEqual({
      discord: {
        checked: 3,
        suspended: 1,
        transient_failures: 1,
      },
      purge: {
        claimed: 0,
        purged: 0,
        failed: 0,
        storageObjectsRemoved: 0,
      },
    })
    expect(mocks.revalidateTenantDirectoryCache).toHaveBeenCalledOnce()
  })

  it('revalidates tenant routing after a purge even without a suspension', async () => {
    mocks.listActiveTenants.mockResolvedValue([])
    mocks.processDueTenantPurges.mockResolvedValue({
      claimed: 1,
      purged: 1,
      failed: 0,
      storageObjectsRemoved: 4,
    })

    const response = await GET(
      new Request('https://example.test/api/cron/tenant-lifecycle'),
    )

    expect(response.status).toBe(200)
    expect(mocks.revalidateTenantDirectoryCache).toHaveBeenCalledOnce()
  })
})
