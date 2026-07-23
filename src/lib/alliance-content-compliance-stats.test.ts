import { describe, expect, it } from 'vitest'
import { buildAllianceContentStats } from './alliance-content-compliance-stats'

const NOW = new Date('2026-07-23T12:00:00.000Z')

describe('buildAllianceContentStats', () => {
  it('builds seven and thirty day member participation statistics', () => {
    const stats = buildAllianceContentStats({
      now: NOW,
      policy: {
        weeklyMinSessions: 2,
        weeklyMinParticipationRate: 50,
      },
      members: [
        { discordId: 'member-1', username: 'Alpha' },
        { discordId: 'member-2', username: 'Bravo' },
      ],
      sessions: [
        { id: 'recent-1', endedAt: '2026-07-22T12:00:00.000Z' },
        { id: 'recent-2', endedAt: '2026-07-20T12:00:00.000Z' },
        { id: 'older-1', endedAt: '2026-07-10T12:00:00.000Z' },
      ],
      participations: [
        { sessionId: 'recent-1', discordId: 'member-1' },
        { sessionId: 'recent-2', discordId: 'member-1' },
        { sessionId: 'older-1', discordId: 'member-1' },
        { sessionId: 'recent-1', discordId: 'member-2' },
      ],
      requirements: [
        { discordId: 'member-1', status: 'submitted' },
        { discordId: 'member-2', status: 'open' },
        { discordId: 'member-2', status: 'overdue' },
      ],
    })

    expect(stats.sevenDays).toMatchObject({
      windowDays: 7,
      totalSessions: 2,
      activeMemberCount: 2,
      achievedMemberCount: 1,
      belowMemberCount: 1,
      averageParticipationRate: 75,
    })
    expect(stats.sevenDays.members).toEqual([
      expect.objectContaining({
        discordId: 'member-2',
        participationCount: 1,
        participationRate: 50,
        hasMetTarget: false,
        missingVideoCount: 2,
      }),
      expect.objectContaining({
        discordId: 'member-1',
        participationCount: 2,
        participationRate: 100,
        hasMetTarget: true,
        submittedVideoCount: 1,
      }),
    ])
    expect(stats.thirtyDays.members).toContainEqual(
      expect.objectContaining({
        discordId: 'member-1',
        participationCount: 3,
        participationRate: 100,
        targetSessionCount: 9,
      }),
    )
  })

  it('returns zero rates without dividing by zero when no sessions exist', () => {
    const stats = buildAllianceContentStats({
      now: NOW,
      policy: { weeklyMinSessions: 0, weeklyMinParticipationRate: 0 },
      members: [{ discordId: 'member-1', username: 'Alpha' }],
      sessions: [],
      participations: [],
      requirements: [],
    })

    expect(stats.sevenDays.members[0]).toMatchObject({
      participationCount: 0,
      participationRate: 0,
      hasMetTarget: true,
    })
    expect(stats.sevenDays.averageParticipationRate).toBe(0)
  })
})
