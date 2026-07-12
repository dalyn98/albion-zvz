import { describe, expect, it } from 'vitest'
import { toPublicMemberActivityDetail } from './public-member-activity'
import type { GuildMemberDetail } from '@/app/actions/members-admin'

function detailFixture(): GuildMemberDetail {
  return {
    discord_id: 'secret-discord-id',
    username: 'Discord name',
    avatar: null,
    updated_at: '2026-07-01T00:00:00.000Z',
    preferred_language: 'ko',
    albion_identity: {
      profileId: null,
      server: 'west',
      playerId: 'player-1',
      nickname: 'Albion name',
      currentGuildId: null,
      currentGuildName: null,
      currentAllianceId: null,
      currentAllianceName: null,
      statusReason: null,
      verifiedAt: null,
      trustedAt: null,
      lastSyncedAt: null,
      lastManualSyncAt: null,
      relation: 'home_guild',
      trustStatus: 'trusted',
    },
    participation_count: 1,
    role_breakdown: [{ role: 'Healer', count: 1 }],
    events: [{
      event_id: 'event-1',
      event_title: 'Internal event title',
      role: 'Healer',
      battle_started_at: null,
      gather_at: null,
      created_at: '2026-07-01T00:00:00.000Z',
    }],
    weapon_breakdown: [],
    regears: [],
    video_proofs: [],
    exchanges: [],
    balance: 999_999,
    lifetime_earned: 999_999,
    lifetime_spent: 1,
    killboard: { kills: 1, deaths: 0, kill_fame: 100, death_fame: 0 },
    advanced_stats: {
      survival_rate: 1,
      evaluated_events: 1,
      participation_current_streak: 1,
      participation_longest_streak: 1,
      deathless_current_streak: 1,
      deathless_longest_streak: 1,
      kill_rank: 1,
      kill_rank_percentile: 1,
      kill_rank_total: 1,
      participation_rank: 1,
      participation_rank_percentile: 1,
      participation_rank_total: 1,
      wins: 1,
      losses: 0,
      win_rate: 1,
      evaluated_outcome_events: 1,
    },
    kill_history: [],
  }
}

describe('toPublicMemberActivityDetail', () => {
  it('allowlists activity data and excludes internal identifiers and finances', () => {
    const result = toPublicMemberActivityDetail(detailFixture())

    expect(result).toMatchObject({ displayName: 'Albion name', participation_count: 1 })
    expect(result.events[0]).not.toHaveProperty('event_title')
    expect(result).not.toHaveProperty('discord_id')
    expect(result).not.toHaveProperty('regears')
    expect(result).not.toHaveProperty('video_proofs')
    expect(result).not.toHaveProperty('exchanges')
    expect(result).not.toHaveProperty('balance')
    expect(result).not.toHaveProperty('lifetime_earned')
    expect(result).not.toHaveProperty('lifetime_spent')
  })
})
