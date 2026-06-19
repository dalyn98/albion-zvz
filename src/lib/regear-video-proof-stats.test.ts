import { describe, expect, it } from 'vitest'
import { buildRegearVideoProofStats } from './regear-video-proof-stats'

describe('buildRegearVideoProofStats', () => {
  it('aggregates video proof member stats for active guild members only', () => {
    const stats = buildRegearVideoProofStats({
      window: '30',
      windowDays: 30,
      avatars: [
        {
          discordId: 'member-a',
          username: 'Alice',
          avatar: 'alice.png',
          isAdmin: false,
          withdrawnAt: null,
        },
        {
          discordId: 'member-b',
          username: 'Bora',
          avatar: null,
          isAdmin: true,
          withdrawnAt: null,
        },
        {
          discordId: 'member-old',
          username: 'Old',
          avatar: null,
          isAdmin: false,
          withdrawnAt: '2026-05-01T00:00:00.000Z',
        },
      ],
      requests: [
        {
          discordId: 'member-a',
          username: 'Alice stale',
          status: 'pending',
          createdAt: '2026-06-19T12:00:00.000Z',
          videoProofUrl: 'https://www.youtube.com/embed/oHg5SJYRHA0',
        },
        {
          discordId: 'member-a',
          username: 'Alice stale',
          status: 'pending',
          createdAt: '2026-06-18T12:00:00.000Z',
          videoProofUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        },
        {
          discordId: 'member-a',
          username: 'Alice stale',
          status: 'approved',
          createdAt: '2026-06-17T12:00:00.000Z',
          videoProofUrl: null,
        },
        {
          discordId: 'member-b',
          username: 'Bora stale',
          status: 'pending',
          createdAt: '2026-06-16T12:00:00.000Z',
          videoProofUrl: '   ',
        },
        {
          discordId: 'member-old',
          username: 'Old',
          status: 'pending',
          createdAt: '2026-06-15T12:00:00.000Z',
          videoProofUrl: 'https://www.youtube.com/embed/oHg5SJYRHA0',
        },
        {
          discordId: 'orphan',
          username: 'Orphan',
          status: 'pending',
          createdAt: '2026-06-14T12:00:00.000Z',
          videoProofUrl: null,
        },
      ],
    })

    expect(stats).toMatchObject({
      window: '30',
      windowDays: 30,
      totalRequests: 4,
      withVideoProof: 2,
      videoProofMemberCount: 1,
      averageVideoProofsPerMember: 2,
      attachmentRate: 0.5,
      latestVideoProofAt: '2026-06-19T12:00:00.000Z',
    })
    expect(stats.members).toEqual([
      {
        discordId: 'member-a',
        username: 'Alice',
        avatar: 'alice.png',
        isAdmin: false,
        requestCount: 3,
        videoProofCount: 2,
        attachmentRate: 2 / 3,
        lastRequestAt: '2026-06-19T12:00:00.000Z',
        lastVideoProofAt: '2026-06-19T12:00:00.000Z',
      },
    ])
  })

  it('returns zeroed stats when no active member requests exist', () => {
    const stats = buildRegearVideoProofStats({
      window: 'all',
      windowDays: null,
      avatars: [],
      requests: [
        {
          discordId: 'withdrawn',
          username: 'Withdrawn',
          status: 'pending',
          createdAt: '2026-06-18T12:00:00.000Z',
          videoProofUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
        },
      ],
    })

    expect(stats).toEqual({
      window: 'all',
      windowDays: null,
      totalRequests: 0,
      withVideoProof: 0,
      videoProofMemberCount: 0,
      averageVideoProofsPerMember: 0,
      attachmentRate: 0,
      latestVideoProofAt: null,
      members: [],
    })
  })

  it('reports the latest video proof across all members, regardless of member sort order', () => {
    const stats = buildRegearVideoProofStats({
      window: '30',
      windowDays: 30,
      avatars: [
        {
          discordId: 'member-a',
          username: 'Alice',
          avatar: null,
          isAdmin: false,
          withdrawnAt: null,
        },
        {
          discordId: 'member-b',
          username: 'Bora',
          avatar: null,
          isAdmin: false,
          withdrawnAt: null,
        },
      ],
      requests: [
        {
          discordId: 'member-a',
          username: 'Alice',
          status: 'approved',
          createdAt: '2026-06-18T12:00:00.000Z',
          videoProofUrl: 'https://www.youtube.com/embed/a',
        },
        {
          discordId: 'member-a',
          username: 'Alice',
          status: 'approved',
          createdAt: '2026-06-17T12:00:00.000Z',
          videoProofUrl: 'https://www.youtube.com/embed/b',
        },
        {
          discordId: 'member-b',
          username: 'Bora',
          status: 'approved',
          createdAt: '2026-06-19T12:00:00.000Z',
          videoProofUrl: 'https://www.youtube.com/embed/c',
        },
      ],
    })

    expect(stats.members[0]?.discordId).toBe('member-a')
    expect(stats.latestVideoProofAt).toBe('2026-06-19T12:00:00.000Z')
  })
})
