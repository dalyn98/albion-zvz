import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getSessionGuildId: vi.fn(),
  getTenantDiscordConfig: vi.fn(),
  isValidTenantSlug: vi.fn(),
  resolveTenantBySlug: vi.fn(),
  tenantUrl: vi.fn(),
}))

vi.mock('react', () => ({
  cache: (fn: unknown) => fn,
}))

vi.mock('next/headers', () => ({
  cookies: mocks.cookies,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
  getTenantDiscordConfig: mocks.getTenantDiscordConfig,
}))

vi.mock('@/lib/tenant-resolver', () => ({
  isValidTenantSlug: mocks.isValidTenantSlug,
  resolveTenantBySlug: mocks.resolveTenantBySlug,
  tenantUrl: mocks.tenantUrl,
}))

import { getMarketingMyGuildHref } from './last-guild'

describe('getMarketingMyGuildHref', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.tenantUrl.mockImplementation((slug: string, path: string) => (
      `https://${slug}.albion-guildmanager.com${path}`
    ))
  })

  it('uses the active Discord session guild before consulting the last-guild cookie', async () => {
    mocks.getSessionGuildId.mockResolvedValue('tenant-1')
    mocks.getTenantDiscordConfig.mockResolvedValue({ slug: 'menhera' })

    await expect(getMarketingMyGuildHref({
      isGuest: false,
      discordId: 'admin-1',
    } as never)).resolves.toBe('https://menhera.albion-guildmanager.com/')

    expect(mocks.cookies).not.toHaveBeenCalled()
    expect(mocks.tenantUrl).toHaveBeenCalledWith('menhera', '/')
  })

  it('returns the remembered guild href when the Discord session is gone', async () => {
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => ({ value: 'menhera' })),
    })
    mocks.isValidTenantSlug.mockReturnValue(true)
    mocks.resolveTenantBySlug.mockResolvedValue({
      tenantId: 'tenant-1',
      slug: 'menhera',
      name: 'Menhera',
      discordGuildId: 'discord-guild-1',
    })

    await expect(getMarketingMyGuildHref(null)).resolves.toBe(
      'https://menhera.albion-guildmanager.com/',
    )

    expect(mocks.resolveTenantBySlug).toHaveBeenCalledWith('menhera')
    expect(mocks.tenantUrl).toHaveBeenCalledWith('menhera', '/')
  })

  it('ignores invalid remembered guild cookie values', async () => {
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => ({ value: '../bad' })),
    })
    mocks.isValidTenantSlug.mockReturnValue(false)

    await expect(getMarketingMyGuildHref(null)).resolves.toBeNull()

    expect(mocks.resolveTenantBySlug).not.toHaveBeenCalled()
  })
})
