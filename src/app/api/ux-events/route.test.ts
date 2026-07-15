import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  getAppSetting: vi.fn(),
  insert: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }))
vi.mock('@/lib/tenant', () => ({ getSessionGuildId: mocks.getSessionGuildId }))
vi.mock('@/lib/app-settings', () => ({ getAppSetting: mocks.getAppSetting }))
vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({ from: mocks.from }),
}))

import { POST } from './route'

const validPayload = {
  eventType: 'surface_view',
  surface: 'admin_approvals',
  flowId: '79f33846-a8be-45fb-9df7-fbfafc6e593c',
  elapsedMs: 240,
  metadata: { viewport: 'desktop' },
}

function request(body: unknown, origin = 'https://menhera.albion-guildmanager.com'): NextRequest {
  return new NextRequest('https://menhera.albion-guildmanager.com/api/ux-events', {
    method: 'POST',
    headers: {
      host: 'menhera.albion-guildmanager.com',
      origin,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('POST /api/ux-events', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.from.mockReturnValue({ insert: mocks.insert })
    mocks.insert.mockResolvedValue({ error: null })
    mocks.getSession.mockResolvedValue({
      isAdmin: true,
      isMember: true,
      isGuest: false,
      isLocalGuildAccount: false,
    })
    mocks.getSessionGuildId.mockResolvedValue('11111111-1111-4111-8111-111111111111')
    mocks.getAppSetting.mockResolvedValue('true')
  })

  it('requires an authenticated tenant session', async () => {
    mocks.getSession.mockResolvedValue(null)
    const response = await POST(request(validPayload))
    expect(response.status).toBe(401)
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('rejects cross-origin telemetry', async () => {
    const response = await POST(request(validPayload, 'https://evil.example'))
    expect(response.status).toBe(403)
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('does not collect events for tenants outside the staged rollout', async () => {
    mocks.getAppSetting.mockResolvedValue('false')
    const response = await POST(request(validPayload))
    expect(response.status).toBe(204)
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('rejects payloads containing non-allowlisted metadata', async () => {
    const response = await POST(request({
      ...validPayload,
      metadata: { discordId: '1234' },
    }))
    expect(response.status).toBe(400)
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it('stores only tenant, actor category, flow and allowlisted workflow data', async () => {
    const response = await POST(request(validPayload))
    expect(response.status).toBe(202)
    expect(mocks.from).toHaveBeenCalledWith('ux_events')
    expect(mocks.insert).toHaveBeenCalledWith({
      guild_id: '11111111-1111-4111-8111-111111111111',
      flow_id: validPayload.flowId,
      actor_kind: 'admin',
      event_type: 'surface_view',
      surface: 'admin_approvals',
      elapsed_ms: 240,
      metadata: { viewport: 'desktop' },
    })
  })
})
