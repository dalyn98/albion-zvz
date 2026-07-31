import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  classifyHost: vi.fn(),
  resolveTenantBySlug: vi.fn(),
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/tenant-resolver', () => ({
  classifyHost: mocks.classifyHost,
  resolveTenantBySlug: mocks.resolveTenantBySlug,
}))

import { GET } from './route'

const session = {
  discordId: 'member-1',
  guildId: 'tenant-1',
  isMember: true,
}

function request(host = 'menhera.albion-guildmanager.com') {
  return new NextRequest(`https://${host}/api/auth/my-guild`)
}

describe('GET /api/auth/my-guild', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.classifyHost.mockReturnValue({ kind: 'tenant', slug: 'menhera' })
    mocks.getSession.mockResolvedValue(session)
    mocks.getSessionGuildId.mockResolvedValue('tenant-1')
    mocks.resolveTenantBySlug.mockResolvedValue({
      tenantId: 'tenant-1',
      slug: 'menhera',
    })
  })

  it('returns an authenticated member to the tenant home', async () => {
    const response = await GET(request())

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://menhera.albion-guildmanager.com/',
    )
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
  })

  it('sends an expired tenant session through login before returning home', async () => {
    mocks.getSession.mockResolvedValue(null)

    const response = await GET(request())

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://menhera.albion-guildmanager.com/login?returnTo=%2F',
    )
    expect(mocks.getSessionGuildId).not.toHaveBeenCalled()
  })

  it('rejects a session belonging to another tenant', async () => {
    mocks.getSessionGuildId.mockResolvedValue('tenant-2')

    const response = await GET(request())

    expect(response.headers.get('location')).toBe(
      'https://menhera.albion-guildmanager.com/login?returnTo=%2F',
    )
  })

  it('fails closed when the entry route is reached outside a tenant host', async () => {
    mocks.classifyHost.mockReturnValue({ kind: 'root' })

    const response = await GET(request('albion-guildmanager.com'))

    expect(response.headers.get('location')).toBe(
      'https://albion-guildmanager.com/login?returnTo=%2F',
    )
    expect(mocks.resolveTenantBySlug).not.toHaveBeenCalled()
  })
})
