import { beforeEach, describe, expect, it, vi } from 'vitest'

const EVENT_ID = '11111111-1111-4111-8111-111111111111'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getSessionGuildId: vi.fn(),
  rpc: vi.fn(),
  checkEventStateRateLimit: vi.fn(),
  canUseAllianceEventFeaturesForSession: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-vercel-forwarded-for': '203.0.113.42' }),
}))

vi.mock('@/lib/session', () => ({ getSession: mocks.getSession }))
vi.mock('@/lib/tenant', () => ({ getSessionGuildId: mocks.getSessionGuildId }))
vi.mock('@/lib/supabase-admin', () => ({
  getAdminClient: () => ({ rpc: mocks.rpc }),
}))
vi.mock('@/lib/event-state-rate-limit', () => ({
  parseEventStateId: (value: string) => value === EVENT_ID ? value : null,
  checkEventStateRateLimit: mocks.checkEventStateRateLimit,
}))
vi.mock('@/lib/albion-identity', () => ({
  canUseAllianceEventFeaturesForSession: mocks.canUseAllianceEventFeaturesForSession,
}))

import { GET } from './route'

const baseSession = {
  discordId: 'member-1',
  username: 'Member',
  avatar: null,
  isMember: true,
  isAdmin: false,
  isGuest: false,
  isBombSquadCaller: false,
  isLocalGuildAccount: false,
  isAllianceCandidate: false,
  canCreateEvents: false,
  eventCreatorCategories: [],
  eventScope: null,
  guildId: 'guild-1',
  capabilities: '0',
  issuedAt: 1,
}

function request(): Request {
  return new Request(`https://example.test/api/events/${EVENT_ID}/state`)
}

function context(id = EVENT_ID): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

describe('GET /api/events/[id]/state', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.getSession.mockResolvedValue(baseSession)
    mocks.getSessionGuildId.mockResolvedValue('guild-1')
    mocks.checkEventStateRateLimit.mockReturnValue({ allowed: true, retryAfterSeconds: 0 })
    mocks.canUseAllianceEventFeaturesForSession.mockResolvedValue(false)
    mocks.rpc.mockResolvedValue({
      data: {
        fingerprint: 'fingerprint-1',
        battle_started_at: null,
        gather_at: null,
      },
      error: null,
    })
  })

  it('rejects missing sessions before any database work', async () => {
    mocks.getSession.mockResolvedValue(null)

    const response = await GET(request(), context())

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(mocks.getSessionGuildId).not.toHaveBeenCalled()
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects a guest whose signed event scope does not match', async () => {
    mocks.getSession.mockResolvedValue({
      ...baseSession,
      isMember: false,
      isGuest: true,
      eventScope: '22222222-2222-4222-8222-222222222222',
    })

    const response = await GET(request(), context())

    expect(response.status).toBe(404)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('allows a guest only for the event in their signed scope', async () => {
    mocks.getSession.mockResolvedValue({
      ...baseSession,
      isMember: false,
      isGuest: true,
      eventScope: EVENT_ID,
    })

    const response = await GET(request(), context())

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledOnce()
  })

  it('requires the alliance eligibility check for candidate-only sessions', async () => {
    mocks.getSession.mockResolvedValue({
      ...baseSession,
      isMember: false,
      isAllianceCandidate: true,
    })

    const deniedResponse = await GET(request(), context())
    expect(deniedResponse.status).toBe(404)
    expect(mocks.rpc).not.toHaveBeenCalled()

    mocks.canUseAllianceEventFeaturesForSession.mockResolvedValue(true)
    const allowedResponse = await GET(request(), context())
    expect(allowedResponse.status).toBe(200)
    expect(mocks.canUseAllianceEventFeaturesForSession).toHaveBeenCalledWith(
      'member-1',
      'guild-1',
    )
  })

  it('returns 503 for a transient RPC failure rather than treating it as deletion', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'temporary failure' } })

    const response = await GET(request(), context())

    expect(response.status).toBe(503)
    expect(response.headers.get('cache-control')).toContain('no-store')
  })

  it('returns a bounded retry response before snapshot database work', async () => {
    mocks.checkEventStateRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 42 })

    const response = await GET(request(), context())

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('42')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns the tenant-scoped snapshot for an eligible session', async () => {
    const response = await GET(request(), context())

    expect(response.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledWith('get_event_state_snapshot', {
      p_guild_id: 'guild-1',
      p_event_id: EVENT_ID,
    })
    await expect(response.json()).resolves.toEqual({
      fingerprint: 'fingerprint-1',
      shouldPoll: true,
    })
  })
})
