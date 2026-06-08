import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  logTenantOnboardingEvent: vi.fn(),
}))

vi.mock('@/lib/session', () => ({
  getSession: mocks.getSession,
}))

vi.mock('@/lib/tenant', () => ({
  getSessionGuildId: mocks.getSessionGuildId,
}))

vi.mock('@/lib/tenant-onboarding-events', () => ({
  isTenantOnboardingEventType: (value: unknown) =>
    value === 'member_invite_copied' || value === 'admin_dashboard_viewed',
  logTenantOnboardingEvent: mocks.logTenantOnboardingEvent,
}))

import { POST } from './route'

function request(body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('https://menhera.albion-guildmanager.com/api/admin/onboarding/track', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/admin/onboarding/track', () => {
  beforeEach(() => {
    mocks.getSession.mockReset()
    mocks.getSessionGuildId.mockReset()
    mocks.logTenantOnboardingEvent.mockReset()
  })

  it('requires a same-origin admin session before recording client onboarding events', async () => {
    mocks.getSession.mockResolvedValue({ isAdmin: true, discordId: 'admin-1' })

    const response = await POST(
      request(
        { eventType: 'member_invite_copied' },
        { host: 'menhera.albion-guildmanager.com', origin: 'https://evil.example' },
      ),
    )

    expect(response.status).toBe(403)
    expect(mocks.getSessionGuildId).not.toHaveBeenCalled()
    expect(mocks.logTenantOnboardingEvent).not.toHaveBeenCalled()
  })

  it('records the member invite copy event for the current tenant', async () => {
    mocks.getSession.mockResolvedValue({ isAdmin: true, discordId: 'admin-1' })
    mocks.getSessionGuildId.mockResolvedValue('tenant-1')
    mocks.logTenantOnboardingEvent.mockResolvedValue({ ok: true })

    const response = await POST(
      request(
        { eventType: 'member_invite_copied' },
        {
          host: 'menhera.albion-guildmanager.com',
          origin: 'https://menhera.albion-guildmanager.com',
        },
      ),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(mocks.logTenantOnboardingEvent).toHaveBeenCalledWith({
      guildId: 'tenant-1',
      actorDiscordId: 'admin-1',
      eventType: 'member_invite_copied',
      details: {},
    })
  })
})
