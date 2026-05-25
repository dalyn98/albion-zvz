import { describe, expect, it } from 'vitest'
import type { SessionPayload } from './session'
import { getEventInteractionSession } from './event-session'

function session(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    discordId: 'discord-1',
    username: 'tester',
    avatar: null,
    isMember: true,
    isAdmin: false,
    isGuest: false,
    isLocalGuildAccount: false,
    canCreateEvents: false,
    eventCreatorCategories: [],
    eventScope: null,
    guildId: 'guild-1',
    capabilities: '0',
    issuedAt: Date.now(),
    ...overrides,
  }
}

describe('getEventInteractionSession', () => {
  it('treats a guest session for another event as signed out for this event', () => {
    const current = session({
      isMember: false,
      isGuest: true,
      eventScope: 'event-old',
    })

    expect(
      getEventInteractionSession({
        session: current,
        sessionGuildId: 'guild-1',
        eventGuildId: 'guild-1',
        eventId: 'event-new',
      }),
    ).toBeNull()
  })

  it('allows the matching event guest session to interact', () => {
    const current = session({
      isMember: false,
      isGuest: true,
      eventScope: 'event-1',
    })

    expect(
      getEventInteractionSession({
        session: current,
        sessionGuildId: 'guild-1',
        eventGuildId: 'guild-1',
        eventId: 'event-1',
      }),
    ).toBe(current)
  })

  it('treats a session from another guild as signed out for this event', () => {
    expect(
      getEventInteractionSession({
        session: session(),
        sessionGuildId: 'guild-1',
        eventGuildId: 'guild-2',
        eventId: 'event-1',
      }),
    ).toBeNull()
  })
})
