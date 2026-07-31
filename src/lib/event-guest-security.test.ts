import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  consumeEventGuestRequestBudget,
  createEventGuestManagementSecret,
  hashEventGuestManagementSecret,
  isEventGuestManagementSecret,
} from './event-guest-security'

describe('event guest passwordless security', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('creates URL-safe high-entropy management secrets and stores only a digest', async () => {
    const secret = createEventGuestManagementSecret()
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(isEventGuestManagementSecret(secret)).toBe(true)

    const digest = await hashEventGuestManagementSecret(secret)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(digest).not.toContain(secret)
    await expect(
      hashEventGuestManagementSecret('too-short'),
    ).rejects.toThrow('invalid_management_secret')
  })

  it('sends only an HMAC-derived connection scope to the database', async () => {
    vi.stubEnv('COOKIE_SECRET', 'test-cookie-secret-with-sufficient-entropy')
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null })
    const db = { rpc }
    const allowed = await consumeEventGuestRequestBudget({
      db: db as never,
      headers: new Headers({
        'x-forwarded-for': '203.0.113.25',
        'user-agent': 'Guest Browser',
      }),
      guildId: 'guild-id',
      eventId: 'event-id',
      action: 'slot',
      subject: 'group-invite-secret',
      bucketSeconds: 300,
      limit: 12,
    })

    expect(allowed).toBe(true)
    expect(rpc).toHaveBeenCalledWith(
      'consume_event_guest_request_budget',
      expect.objectContaining({
        p_scope_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    )
    const payload = rpc.mock.calls[0]?.[1] as Record<string, unknown>
    expect(JSON.stringify(payload)).not.toContain('203.0.113.25')
    expect(JSON.stringify(payload)).not.toContain('Guest Browser')
    expect(JSON.stringify(payload)).not.toContain('group-invite-secret')
  })
})
