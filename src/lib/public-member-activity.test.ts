import { describe, expect, it } from 'vitest'
import { toPublicMemberActivityDetail } from './public-member-activity'
import type { GuildMemberDetail } from '@/app/actions/members-admin'

function detailFixture(): GuildMemberDetail {
  return {
    guild_member_id: '11111111-1111-4111-8111-111111111111',
    display_name_override: null,
    discord_username: 'Discord name',
    discord_id: 'secret-discord-id',
    username: 'Discord name',
    avatar: null,
    updated_at: '2026-07-01T00:00:00.000Z',
    preferred_language: 'ko',
    member_state: 'active',
    albion_identity: {
      server: 'west',
      nickname: 'Albion name',
      currentGuildName: null,
      currentAllianceName: null,
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
    planned_weapon_categories: [],
    observed_weapon_usage: {
      source: 'killboard_equipment',
      windowDays: 30,
      sampleCount: 0,
      categories: [],
    },
    achievements: [],
    regear: {
      regears: [],
      video_proofs: [],
    },
    finance: {
      exchanges: [],
      balance: 999_999,
      lifetime_earned: 999_999,
      lifetime_spent: 1,
    },
    killboard: { kills: 1, deaths: 0, kill_fame: 100, death_fame: 0 },
    advanced_stats: {
      survival_rate: 1,
      evaluated_events: 1,
      participation_current_streak: 1,
      participation_longest_streak: 1,
      deathless_current_streak: 1,
      deathless_longest_streak: 1,
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
    expect(result).not.toHaveProperty('events')
    expect(result).not.toHaveProperty('kill_history')
    expect(result).not.toHaveProperty('discord_id')
    expect(result).not.toHaveProperty('username')
    expect(result).not.toHaveProperty('avatar')
    expect(result).not.toHaveProperty('regears')
    expect(result).not.toHaveProperty('video_proofs')
    expect(result).not.toHaveProperty('exchanges')
    expect(result).not.toHaveProperty('balance')
    expect(result).not.toHaveProperty('lifetime_earned')
    expect(result).not.toHaveProperty('lifetime_spent')
    expect(result.achievements).toEqual([])
  })

  it('includes permanent achievements only after the separate public opt-in', () => {
    const detail = detailFixture()
    detail.achievements = [{
      id: 'achievement-1',
      achievementKey: 'team_victory',
      track: 'team',
      definitionVersion: 1,
      evidenceType: 'official_battle',
      evidenceId: 'battle-1',
      evidence: {},
      earnedAt: '2026-07-01T00:00:00.000Z',
      recordedAt: '2026-07-01T00:00:00.000Z',
    }]

    expect(toPublicMemberActivityDetail(detail).achievements).toEqual([])
    expect(
      toPublicMemberActivityDetail(detail, { includeAchievements: true })
        .achievements,
    ).toEqual([
      {
        definition: expect.objectContaining({
          key: 'team_victory',
          track: 'team',
          definitionVersion: 1,
        }),
        count: 1,
      },
    ])
    const serialized = JSON.stringify(
      toPublicMemberActivityDetail(detail, { includeAchievements: true }),
    )
    expect(serialized).not.toContain('battle-1')
    expect(serialized).not.toContain('earnedAt')
    expect(serialized).not.toContain('recordedAt')
    expect(serialized).not.toContain('evidence')
  })
})
