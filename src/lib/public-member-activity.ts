import 'server-only'

import type {
  GuildMemberActivityProfile,
  MemberAdvancedStats,
} from '@/app/actions/members-admin'
import {
  summarizeAchievements,
  type AchievementDefinition,
} from '@/lib/member-achievements'

export interface PublicMemberAchievementSummary {
  definition: AchievementDefinition
  count: number
}

export interface PublicMemberActivityDetail {
  displayName: string
  participation_count: number
  role_breakdown: GuildMemberActivityProfile['role_breakdown']
  observed_weapon_usage: GuildMemberActivityProfile['observed_weapon_usage']
  achievements: PublicMemberAchievementSummary[]
  killboard: GuildMemberActivityProfile['killboard']
  advanced_stats: Pick<
    MemberAdvancedStats,
    | 'survival_rate'
    | 'evaluated_events'
    | 'participation_current_streak'
    | 'participation_longest_streak'
    | 'deathless_current_streak'
    | 'deathless_longest_streak'
    | 'wins'
    | 'losses'
    | 'win_rate'
    | 'evaluated_outcome_events'
  >
}

// Public activity links are deliberately a separate DTO boundary. Never pass
// the internal GuildMemberDetail through this route: it contains identifiers,
// regear evidence, admin notes, and point-ledger financial data.
export function toPublicMemberActivityDetail(
  detail: GuildMemberActivityProfile,
  options: { includeAchievements?: boolean } = {},
): PublicMemberActivityDetail {
  return {
    displayName: detail.albion_identity?.nickname?.trim() ?? '',
    participation_count: detail.participation_count,
    role_breakdown: detail.role_breakdown,
    observed_weapon_usage: detail.observed_weapon_usage,
    achievements: options.includeAchievements
      ? summarizeAchievements(detail.achievements).map((summary) => ({
          definition: summary.definition,
          count: summary.count,
        }))
      : [],
    killboard: detail.killboard,
    advanced_stats: {
      survival_rate: detail.advanced_stats.survival_rate,
      evaluated_events: detail.advanced_stats.evaluated_events,
      participation_current_streak: detail.advanced_stats.participation_current_streak,
      participation_longest_streak: detail.advanced_stats.participation_longest_streak,
      deathless_current_streak: detail.advanced_stats.deathless_current_streak,
      deathless_longest_streak: detail.advanced_stats.deathless_longest_streak,
      wins: detail.advanced_stats.wins,
      losses: detail.advanced_stats.losses,
      win_rate: detail.advanced_stats.win_rate,
      evaluated_outcome_events: detail.advanced_stats.evaluated_outcome_events,
    },
  }
}
