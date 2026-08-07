import { describe, expect, it } from 'vitest'
import {
  hasDiscordAdminPermission,
  recommendDiscordOnboardingResources,
} from './discord-onboarding-recommendations'

describe('Discord onboarding recommendations', () => {
  it('recognizes Discord administrator and manage-guild permission bits', () => {
    expect(hasDiscordAdminPermission('8')).toBe(true)
    expect(hasDiscordAdminPermission('32')).toBe(true)
    expect(hasDiscordAdminPermission('0')).toBe(false)
    expect(hasDiscordAdminPermission('invalid')).toBe(false)
  })

  it('selects one high-confidence member role without granting an admin role as member access', () => {
    const result = recommendDiscordOnboardingResources(
      [
        { id: 'admin', name: 'Guild Admin', position: 9, hasAdminPerm: true },
        { id: 'member-low', name: 'Members', position: 3, hasAdminPerm: false },
        { id: 'member-high', name: 'Guild Members', position: 5, hasAdminPerm: false },
        { id: 'guest', name: 'Guest Member', position: 8, hasAdminPerm: false },
      ],
      [],
    )

    expect(result.memberRoleId).toBe('member-high')
  })

  it('prefers an event announcement channel and rejects archives or logs', () => {
    const result = recommendDiscordOnboardingResources(
      [],
      [
        { id: 'archive', name: 'zvz-event-archive', position: 10, parentName: null, type: 0 },
        { id: 'general', name: 'general', position: 1, parentName: null, type: 0 },
        { id: 'events', name: 'zvz-events', position: 4, parentName: 'Operations', type: 5 },
      ],
    )

    expect(result.eventChannelId).toBe('events')
  })

  it('supports localized resource names and leaves weak guesses empty', () => {
    expect(
      recommendDiscordOnboardingResources(
        [{ id: 'member', name: '길드원', position: 1, hasAdminPerm: false }],
        [{ id: 'event', name: '이벤트-공지', position: 1, parentName: null, type: 0 }],
      ),
    ).toEqual({ memberRoleId: 'member', eventChannelId: 'event' })

    expect(
      recommendDiscordOnboardingResources(
        [{ id: 'raider', name: 'Raider', position: 5, hasAdminPerm: false }],
        [{ id: 'chat', name: 'general-chat', position: 5, parentName: null, type: 0 }],
      ),
    ).toEqual({ memberRoleId: null, eventChannelId: null })
  })
})
