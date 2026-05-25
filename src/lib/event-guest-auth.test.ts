import { describe, expect, it, vi } from 'vitest'
import {
  extractEventIdFromReturnTo,
  resolveEventGuestAuthScope,
  resolvePublicEventPageGuildId,
} from './event-guest-auth'

interface QueryStep {
  table: string
  method: string
  args: unknown[]
}

function createDb(results: Record<string, unknown>) {
  const calls: QueryStep[] = []
  const db = {
    from(table: string) {
      const chain = {
        select(...args: unknown[]) {
          calls.push({ table, method: 'select', args })
          return chain
        },
        eq(...args: unknown[]) {
          calls.push({ table, method: 'eq', args })
          return chain
        },
        maybeSingle() {
          calls.push({ table, method: 'maybeSingle', args: [] })
          const value = (results[table] ?? null) as Record<string, unknown> | null
          return Promise.resolve({ data: value, error: null })
        },
      }
      return chain
    },
  }
  return { db, calls }
}

describe('event guest auth scope', () => {
  it('extracts an event id from a relative event return path', () => {
    expect(extractEventIdFromReturnTo('/events/event-1')).toBe('event-1')
    expect(extractEventIdFromReturnTo('/events/event-1?invite=abc')).toBe('event-1')
    expect(extractEventIdFromReturnTo('/events/event-1/party/2')).toBe('event-1')
    expect(extractEventIdFromReturnTo('/onboard')).toBeNull()
    expect(extractEventIdFromReturnTo('//evil.example/events/event-1')).toBeNull()
  })

  it('resolves a valid invite token before considering public event fallback', async () => {
    const { db, calls } = createDb({
      event_guest_tokens: {
        event_id: 'event-from-token',
        revoked_at: null,
        expires_at: '2999-01-01T00:00:00.000Z',
      },
      events: { guild_id: 'guild-from-token', status: 'published' },
    })

    await expect(
      resolveEventGuestAuthScope(db, {
        inviteToken: 'token-1',
        returnTo: '/events/event-from-url',
        nowIso: '2026-05-25T00:00:00.000Z',
      }),
    ).resolves.toEqual({
      eventId: 'event-from-token',
      guildId: 'guild-from-token',
      source: 'invite',
    })
    expect(calls).toContainEqual({
      table: 'event_guest_tokens',
      method: 'eq',
      args: ['token', 'token-1'],
    })
    expect(calls).toContainEqual({
      table: 'events',
      method: 'eq',
      args: ['id', 'event-from-token'],
    })
  })

  it('does not fall back to public event login when an invite token is expired', async () => {
    const { db } = createDb({
      event_guest_tokens: {
        event_id: 'event-from-token',
        revoked_at: null,
        expires_at: '2026-05-24T00:00:00.000Z',
      },
      events: { guild_id: 'guild-from-url', status: 'published' },
    })

    await expect(
      resolveEventGuestAuthScope(db, {
        inviteToken: 'expired',
        returnTo: '/events/event-from-url',
        nowIso: '2026-05-25T00:00:00.000Z',
      }),
    ).resolves.toBeNull()
  })

  it('resolves a published public event return path when no invite token exists', async () => {
    const { db } = createDb({
      events: { guild_id: 'guild-from-url', status: 'published' },
    })

    await expect(
      resolveEventGuestAuthScope(db, {
        inviteToken: null,
        returnTo: '/events/event-from-url',
        nowIso: '2026-05-25T00:00:00.000Z',
      }),
    ).resolves.toEqual({
      eventId: 'event-from-url',
      guildId: 'guild-from-url',
      source: 'public-event',
    })
  })

  it('never creates a public guest scope for draft events', async () => {
    const { db } = createDb({
      events: { guild_id: 'guild-from-url', status: 'draft' },
    })

    await expect(
      resolveEventGuestAuthScope(db, {
        inviteToken: null,
        returnTo: '/events/draft-event',
        nowIso: '2026-05-25T00:00:00.000Z',
      }),
    ).resolves.toBeNull()
  })

  it('keeps the db dependency intentionally narrow', async () => {
    const db = { from: vi.fn(() => ({ select: vi.fn() })) }

    await expect(
      resolveEventGuestAuthScope(db as never, {
        inviteToken: null,
        returnTo: '/not-an-event',
      }),
    ).resolves.toBeNull()
    expect(db.from).not.toHaveBeenCalled()
  })

  it('resolves a root-host public event page by event id when no invite or session guild exists', async () => {
    const { db, calls } = createDb({
      events: { guild_id: 'guild-from-public-event', status: 'published' },
    })

    await expect(
      resolvePublicEventPageGuildId(db, {
        eventId: 'event-1',
        inviteToken: null,
        hostHeader: 'albion-guildmanager.com',
      }),
    ).resolves.toBe('guild-from-public-event')
    expect(calls).toContainEqual({
      table: 'events',
      method: 'eq',
      args: ['id', 'event-1'],
    })
  })

  it('does not resolve draft events through the root-host public page fallback', async () => {
    const { db } = createDb({
      events: { guild_id: 'guild-from-public-event', status: 'draft' },
    })

    await expect(
      resolvePublicEventPageGuildId(db, {
        eventId: 'draft-event',
        inviteToken: null,
        hostHeader: 'albion-guildmanager.com',
      }),
    ).resolves.toBeNull()
  })
})
