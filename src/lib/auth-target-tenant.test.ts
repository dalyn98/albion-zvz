import { describe, expect, it, vi } from 'vitest'
import { resolveAuthTargetTenant } from './auth-target-tenant'

describe('resolveAuthTargetTenant', () => {
  it('resolves a clean public guild profile to its explicit tenant', async () => {
    const resolveTenantBySlug = vi.fn().mockResolvedValue({
      tenantId: 'tenant-guild',
      slug: 'target-guild',
    })
    const getTenantDiscordConfig = vi.fn().mockResolvedValue({
      id: 'tenant-guild',
      slug: 'target-guild',
      discordGuildId: 'discord-guild',
      botInstalled: true,
    })

    await expect(resolveAuthTargetTenant('/g/target-guild', {
      db: { from: vi.fn() },
      resolveTenantBySlug,
      getTenantDiscordConfig,
    })).resolves.toEqual(expect.objectContaining({
      id: 'tenant-guild',
      slug: 'target-guild',
    }))
  })

  it('resolves a root-domain event link by the event guild id', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { guild_id: 'tenant-event' },
      error: null,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))
    const getTenantDiscordConfig = vi.fn().mockResolvedValue({
      id: 'tenant-event',
      slug: 'event-guild',
      discordGuildId: 'discord-event',
      botInstalled: true,
    })

    await expect(resolveAuthTargetTenant('/events/event-1?view=party', {
      db: { from: vi.fn(() => ({ select })) },
      resolveTenantBySlug: vi.fn(),
      getTenantDiscordConfig,
    })).resolves.toEqual(expect.objectContaining({
      id: 'tenant-event',
      slug: 'event-guild',
    }))
  })

  it('fails closed when the event tenant lookup returns a database error', async () => {
    const lookupError = { code: '08006', message: 'connection failure' }
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: lookupError,
    })
    const eq = vi.fn(() => ({ maybeSingle }))
    const select = vi.fn(() => ({ eq }))

    await expect(resolveAuthTargetTenant('/events/event-1', {
      db: { from: vi.fn(() => ({ select })) },
      resolveTenantBySlug: vi.fn(),
      getTenantDiscordConfig: vi.fn(),
    })).rejects.toThrow('Auth target event lookup failed')
  })

  it('does not infer a tenant from unrelated internal paths', async () => {
    await expect(resolveAuthTargetTenant('/me', {
      db: { from: vi.fn() },
      resolveTenantBySlug: vi.fn(),
      getTenantDiscordConfig: vi.fn(),
    })).resolves.toBeNull()
  })
})
