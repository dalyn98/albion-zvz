import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ROLE_EXPERIENCE_HIGHLIGHT_THRESHOLD,
  buildRoleExperienceCounts,
  collectRoleExperienceTargets,
  getRoleExperienceCount,
  isRoleExperienceHighlighted,
} from './event-role-experience'

describe('event role experience', () => {
  it('collects unique assigned and requested member-role targets from event slots', () => {
    const targets = collectRoleExperienceTargets([
      {
        slots: [
          { assigned_discord_id: 'member-1', requested_discord_id: 'member-2', role_name: 'EngageDps' },
          { assigned_discord_id: 'member-1', requested_discord_id: null, role_name: 'Dps' },
          { assigned_discord_id: 'member-3', requested_discord_id: null, role_name: null },
          { assigned_discord_id: null, requested_discord_id: null, role_name: 'Healer' },
        ],
      },
    ])

    expect(targets).toEqual([
      { discordId: 'member-1', roleName: 'EngageDps' },
      { discordId: 'member-2', roleName: 'EngageDps' },
    ])
  })

  it('counts distinct historical events per member and role while excluding the current event', () => {
    const counts = buildRoleExperienceCounts(
      [
        row('member-1', 'EngageDps', 'event-old-1'),
        row('member-1', 'Dps', 'event-old-1'),
        row('member-1', 'BrawlerDps', 'event-old-2'),
        row('member-1', 'EngageDps', 'event-current'),
        row('member-1', 'Healer', 'event-old-3'),
        row('member-2', 'Dps', 'event-old-1'),
        row(null, 'EngageDps', 'event-old-4'),
        row('member-3', null, 'event-old-4'),
        row('member-4', 'EngageDps', null),
      ],
      'event-current',
    )

    expect(counts).toEqual({
      'member-1': {
        EngageDps: 1,
        BrawlerDps: 1,
        Healer: 1,
      },
      'member-2': {
        EngageDps: 1,
      },
    })
    expect(getRoleExperienceCount(counts, 'member-1', 'EngageDps')).toBe(1)
    expect(getRoleExperienceCount(counts, 'member-1', 'BrawlerDps')).toBe(1)
    expect(getRoleExperienceCount(counts, 'member-1', 'BM')).toBe(0)
    expect(getRoleExperienceCount(counts, null, 'EngageDps')).toBeNull()
    expect(getRoleExperienceCount(counts, 'member-1', null)).toBeNull()
  })

  it('highlights counts at or above the default threshold', () => {
    expect(DEFAULT_ROLE_EXPERIENCE_HIGHLIGHT_THRESHOLD).toBe(5)
    expect(isRoleExperienceHighlighted(4)).toBe(false)
    expect(isRoleExperienceHighlighted(5)).toBe(true)
    expect(isRoleExperienceHighlighted(8)).toBe(true)
  })
})

function row(
  discordId: string | null,
  roleName: string | null,
  eventId: string | null,
) {
  return {
    assigned_discord_id: discordId,
    role_name: roleName,
    parties: eventId ? { event_id: eventId } : null,
  }
}
