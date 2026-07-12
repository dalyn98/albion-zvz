import 'server-only'

import type {
  GuildMemberDetail,
  MemberAdvancedStats,
  MemberEventEntry,
} from '@/app/actions/members-admin'

export interface PublicMemberActivityDetail {
  displayName: string
  username: string
  avatar: string | null
  participation_count: number
  role_breakdown: GuildMemberDetail['role_breakdown']
  events: Array<
    Pick<MemberEventEntry, 'event_id' | 'role' | 'battle_started_at' | 'gather_at' | 'created_at'>
  >
  weapon_breakdown: GuildMemberDetail['weapon_breakdown']
  killboard: GuildMemberDetail['killboard']
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
  kill_history: GuildMemberDetail['kill_history']
}

// Public activity links are deliberately a separate DTO boundary. Never pass
// the internal GuildMemberDetail through this route: it contains identifiers,
// regear evidence, admin notes, and point-ledger financial data.
export function toPublicMemberActivityDetail(
  detail: GuildMemberDetail,
): PublicMemberActivityDetail {
  return {
    displayName: detail.albion_identity?.nickname ?? detail.username,
    username: detail.username,
    avatar: detail.avatar,
    participation_count: detail.participation_count,
    role_breakdown: detail.role_breakdown,
    events: detail.events.map((event) => ({
      event_id: event.event_id,
      role: event.role,
      battle_started_at: event.battle_started_at,
      gather_at: event.gather_at,
      created_at: event.created_at,
    })),
    weapon_breakdown: detail.weapon_breakdown,
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
    kill_history: detail.kill_history,
  }
}
