import { describe, expect, it } from 'vitest'
import { buildAllianceContentStats } from './alliance-content-compliance-stats'

const NOW = new Date('2026-07-23T12:00:00.000Z')

describe('buildAllianceContentStats', () => {
  it('builds seven and thirty day member participation statistics', () => {
    const stats = buildAllianceContentStats({
      now: NOW,
      timeZone: 'Asia/Seoul',
      policy: {
        sessionTargetEnabled: true,
        participationDaysTargetEnabled: false,
        weeklyMinSessions: 2,
        weeklyMinParticipationRate: 50,
        weeklyMinParticipationDays: 0,
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
      totalActiveDays: 2,
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
      timeZone: 'Asia/Seoul',
      policy: {
        sessionTargetEnabled: true,
        participationDaysTargetEnabled: false,
        weeklyMinSessions: 0,
        weeklyMinParticipationRate: 0,
        weeklyMinParticipationDays: 0,
      },
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

  it('counts multiple sessions on the same guild-local date as one participation day', () => {
    const stats = buildAllianceContentStats({
      now: new Date('2026-07-23T12:00:00.000Z'),
      timeZone: 'Asia/Seoul',
      policy: {
        sessionTargetEnabled: false,
        participationDaysTargetEnabled: true,
        weeklyMinSessions: 0,
        weeklyMinParticipationRate: 0,
        weeklyMinParticipationDays: 2,
      },
      members: [{ discordId: 'member-1', username: 'Alpha' }],
      sessions: [
        { id: 'session-1', endedAt: '2026-07-21T15:30:00.000Z' },
        { id: 'session-2', endedAt: '2026-07-22T12:00:00.000Z' },
        { id: 'session-3', endedAt: '2026-07-22T15:30:00.000Z' },
      ],
      participations: [
        { sessionId: 'session-1', discordId: 'member-1' },
        { sessionId: 'session-2', discordId: 'member-1' },
        { sessionId: 'session-3', discordId: 'member-1' },
      ],
      requirements: [],
    })

    expect(stats.sevenDays).toMatchObject({ totalSessions: 3, totalActiveDays: 2 })
    expect(stats.sevenDays.members[0]).toMatchObject({
      participationCount: 3,
      participationDayCount: 2,
      targetParticipationDayCount: 2,
      participationDaysTargetMet: true,
      hasMetTarget: true,
    })
  })

  it('uses OR when both session and participation-day targets are enabled', () => {
    const stats = buildAllianceContentStats({
      now: NOW,
      timeZone: 'Asia/Seoul',
      policy: {
        sessionTargetEnabled: true,
        participationDaysTargetEnabled: true,
        weeklyMinSessions: 3,
        weeklyMinParticipationRate: 80,
        weeklyMinParticipationDays: 1,
      },
      members: [{ discordId: 'member-1', username: 'Alpha' }],
      sessions: [
        { id: 'session-1', endedAt: '2026-07-22T12:00:00.000Z' },
        { id: 'session-2', endedAt: '2026-07-22T13:00:00.000Z' },
      ],
      participations: [{ sessionId: 'session-1', discordId: 'member-1' }],
      requirements: [],
    })

    expect(stats.sevenDays.members[0]).toMatchObject({
      sessionTargetMet: false,
      participationDaysTargetMet: true,
      hasMetTarget: true,
    })
  })

  it('scales weekly participation-day targets for the thirty-day window', () => {
    const stats = buildAllianceContentStats({
      now: NOW,
      timeZone: 'Asia/Seoul',
      policy: {
        sessionTargetEnabled: false,
        participationDaysTargetEnabled: true,
        weeklyMinSessions: 0,
        weeklyMinParticipationRate: 0,
        weeklyMinParticipationDays: 3,
      },
      members: [{ discordId: 'member-1', username: 'Alpha' }],
      sessions: [],
      participations: [],
      requirements: [],
    })

    expect(stats.thirtyDays.members[0].targetParticipationDayCount).toBe(13)
  })
})
