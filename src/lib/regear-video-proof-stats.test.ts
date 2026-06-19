import { describe, expect, it } from 'vitest'
import { buildRegearVideoProofStats } from './regear-video-proof-stats'

describe('buildRegearVideoProofStats', () => {
  it('aggregates video proof attachment stats for active guild members only', () => {
    const stats = buildRegearVideoProofStats({
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
      windowDays: 30,
      totalRequests: 3,
      withVideoProof: 1,
      withoutVideoProof: 2,
      pendingWithoutVideoProof: 1,
      activeRequesters: 2,
      attachmentRate: 1 / 3,
    })
    expect(stats.members).toEqual([
      {
        discordId: 'member-a',
        username: 'Alice',
        avatar: 'alice.png',
        isAdmin: false,
        requestCount: 2,
        videoProofCount: 1,
        pendingWithoutVideoProof: 0,
        attachmentRate: 0.5,
        lastRequestAt: '2026-06-18T12:00:00.000Z',
        lastVideoProofAt: '2026-06-18T12:00:00.000Z',
      },
      {
        discordId: 'member-b',
        username: 'Bora',
        avatar: null,
        isAdmin: true,
        requestCount: 1,
        videoProofCount: 0,
        pendingWithoutVideoProof: 1,
        attachmentRate: 0,
        lastRequestAt: '2026-06-16T12:00:00.000Z',
        lastVideoProofAt: null,
      },
    ])
  })

  it('returns zeroed stats when no active member requests exist', () => {
    const stats = buildRegearVideoProofStats({
      windowDays: 30,
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
      windowDays: 30,
      totalRequests: 0,
      withVideoProof: 0,
      withoutVideoProof: 0,
      pendingWithoutVideoProof: 0,
      activeRequesters: 0,
      attachmentRate: 0,
      members: [],
    })
  })
})
