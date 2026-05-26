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
    isBombSquadCaller: false,
    isLocalGuildAccount: false,
    isAllianceCandidate: false,
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

  it('allows a caller-role session without member role to interact with the event', () => {
    const current = session({
      isMember: false,
      isBombSquadCaller: true,
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

  it('allows a verified same-alliance participant without member role to interact', () => {
    const current = session({
      isMember: false,
      isAllianceCandidate: true,
    })

    expect(
      getEventInteractionSession({
        session: current,
        sessionGuildId: 'guild-1',
        eventGuildId: 'guild-1',
        eventId: 'event-1',
        allowAllianceParticipant: true,
      }),
    ).toBe(current)
  })

  it('blocks an unverified alliance candidate from interacting', () => {
    const current = session({
      isMember: false,
      isAllianceCandidate: true,
    })

    expect(
      getEventInteractionSession({
        session: current,
        sessionGuildId: 'guild-1',
        eventGuildId: 'guild-1',
        eventId: 'event-1',
      }),
    ).toBeNull()
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
