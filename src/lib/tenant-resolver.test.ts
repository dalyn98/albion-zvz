import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/cache', () => ({
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))

let nextResults: Array<{ data: Record<string, unknown> | null; error: unknown }> = []
const maybeSingle = vi.fn()

vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle }),
          maybeSingle,
        }),
      }),
    }),
  }),
}))

import { resolveTenantBySlugAnyStatus, tenantUrl } from './tenant-resolver'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('tenantUrl', () => {
  it('preserves the query and fragment in tenant-scoped Discord links', () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')

    expect(
      tenantUrl(
        'menhera',
        '/admin/dashboard/approvals?tab=shop&order=order-1#shop-order-order-1',
      ),
    ).toBe(
      'https://menhera.albion-guildmanager.com/admin/dashboard/approvals?tab=shop&order=order-1#shop-order-order-1',
    )
  })

  it('keeps query and fragment links on the bare preview host', () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.vercel.app')

    expect(tenantUrl('menhera', '/me/settings#discord-dm')).toBe(
      'https://albion-guildmanager.vercel.app/me/settings#discord-dm',
    )
  })

  it('does not let a protocol-relative-looking path replace the tenant host', () => {
    vi.stubEnv('APP_URL', 'https://albion-guildmanager.com')

    expect(tenantUrl('menhera', '//outside.example/approvals?tab=shop')).toBe(
      'https://menhera.albion-guildmanager.com//outside.example/approvals?tab=shop',
    )
  })
})

describe('resolveTenantBySlugAnyStatus', () => {
  beforeEach(() => {
    nextResults = []
    maybeSingle.mockReset().mockImplementation(async () => nextResults.shift())
  })

  it('retries a transient tenant resolver failure instead of treating the guild as missing', async () => {
    nextResults = [
      { data: null, error: { code: '522', message: 'Connection timed out' } },
      {
        data: {
          id: 'tenant-1',
          slug: 'menhera',
          name: 'Menhera',
          discord_guild_id: 'discord-1',
          status: 'active',
        },
        error: null,
      },
    ]

    await expect(resolveTenantBySlugAnyStatus('menhera')).resolves.toEqual({
      tenantId: 'tenant-1',
      slug: 'menhera',
      name: 'Menhera',
      discordGuildId: 'discord-1',
      status: 'active',
    })
    expect(maybeSingle).toHaveBeenCalledTimes(2)
  })
})
