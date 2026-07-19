import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { resolveTenantBySlugAnyStatus } from './tenant-resolver'

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
