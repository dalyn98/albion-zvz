import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getSuperAdminSession: vi.fn(),
  logSuperAdminAction: vi.fn(),
  verifyImpersonation: vi.fn(),
}))

vi.mock('@/lib/super-admin', () => ({
  getSuperAdminSession: mocks.getSuperAdminSession,
}))
vi.mock('@/lib/super-admin-audit', () => ({
  logSuperAdminAction: mocks.logSuperAdminAction,
}))
vi.mock('@/lib/super-admin-path', () => ({
  getSuperAdminPath: () => '/operator-console',
}))
vi.mock('@/lib/super-admin-impersonation-token', () => ({
  IMPERSONATION_COOKIE_NAME: 'super_admin_impersonating',
  verifyImpersonation: mocks.verifyImpersonation,
}))

import { POST } from './route'

const URL = 'https://menhera.albion-guildmanager.com/api/super-admin/impersonation/end'

function request(overrides: { origin?: string; host?: string; cookie?: string } = {}) {
  return new NextRequest(URL, {
    method: 'POST',
    headers: {
      origin: overrides.origin ?? 'https://menhera.albion-guildmanager.com',
      host: overrides.host ?? 'menhera.albion-guildmanager.com',
      ...(overrides.cookie ? { cookie: overrides.cookie } : {}),
    },
  })
}

beforeEach(() => {
  mocks.getSuperAdminSession.mockReset().mockResolvedValue({
    discordId: 'super-admin-1',
  })
  mocks.logSuperAdminAction.mockReset().mockResolvedValue(undefined)
  mocks.verifyImpersonation.mockReset().mockResolvedValue(null)
})

describe('POST /api/super-admin/impersonation/end', () => {
  it('rejects cross-origin and unauthenticated requests without clearing state', async () => {
    const crossOrigin = await POST(request({ origin: 'https://evil.example' }))
    expect(crossOrigin.status).toBe(403)

    mocks.getSuperAdminSession.mockResolvedValue(null)
    const unauthenticated = await POST(request())
    expect(unauthenticated.status).toBe(401)
    expect(mocks.logSuperAdminAction).not.toHaveBeenCalled()
  })

  it('clears a valid support-view cookie and audits its target before redirecting', async () => {
    const tenantId = '123e4567-e89b-42d3-a456-426614174000'
    mocks.verifyImpersonation.mockResolvedValue({ tenantId, startedAt: Date.now() })

    const response = await POST(
      request({ cookie: 'super_admin_impersonating=signed-support-view' }),
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe(
      'https://menhera.albion-guildmanager.com/operator-console/tenants',
    )
    expect(response.headers.get('set-cookie')).toMatch(
      /super_admin_impersonating=;.*Expires=Thu, 01 Jan 1970 00:00:00 GMT/i,
    )
    expect(mocks.logSuperAdminAction).toHaveBeenCalledWith({
      superAdminDiscordId: 'super-admin-1',
      action: 'impersonate.end',
      targetTenantId: tenantId,
      details: { mode: 'read_only_support_view' },
    })
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('still clears a malformed cookie without fabricating an audit target', async () => {
    const response = await POST(
      request({ cookie: 'super_admin_impersonating=malformed' }),
    )

    expect(response.status).toBe(303)
    expect(response.headers.get('set-cookie')).toMatch(
      /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i,
    )
    expect(mocks.logSuperAdminAction).not.toHaveBeenCalled()
  })
})
