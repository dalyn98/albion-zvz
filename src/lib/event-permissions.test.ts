import { describe, expect, it } from 'vitest'
import { CAP } from '@/lib/permissions'
import type { SessionPayload } from '@/lib/session-verify'
import {
  getCreatableEventCategories,
  sessionCanCreateEventCategory,
  sessionCanCreateOrManageEvents,
} from './event-permissions'

function session(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    discordId: 'user-1',
    username: 'User',
    avatar: null,
    isAdmin: false,
    isMember: true,
    isGuest: false,
    isLocalGuildAccount: false,
    canCreateEvents: false,
    eventCreatorCategories: [],
    eventScope: null,
    guildId: 'guild-1',
    capabilities: '0',
    issuedAt: 0,
    ...overrides,
  }
}

describe('event permission helpers', () => {
  it('maps category create capabilities into visible event categories', () => {
    const s = session({
      capabilities: (CAP.EVENT_CREATE_COMBAT | CAP.EVENT_CREATE_FF).toString(),
    })

    expect(sessionCanCreateOrManageEvents(s)).toBe(true)
    expect(getCreatableEventCategories(s)).toEqual(['전투', 'FF'])
    expect(sessionCanCreateEventCategory(s, '갱킹')).toBe(false)
  })

  it('lets event managers operate on every category', () => {
    const s = session({ capabilities: CAP.EVENT_MANAGE.toString() })

    expect(sessionCanCreateOrManageEvents(s)).toBe(true)
    expect(getCreatableEventCategories(s)).toEqual(['전투', 'FF', '갱킹'])
    expect(sessionCanCreateEventCategory(s, '갱킹')).toBe(true)
  })

  it('keeps legacy event creator role categories working', () => {
    const s = session({ canCreateEvents: true, eventCreatorCategories: ['갱킹'] })

    expect(sessionCanCreateOrManageEvents(s)).toBe(true)
    expect(getCreatableEventCategories(s)).toEqual(['갱킹'])
  })
})
