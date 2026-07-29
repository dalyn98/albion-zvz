import {
  ACHIEVEMENT_DEFINITIONS,
  type MemberAchievement,
} from '@/lib/member-achievements'
import { DEMO_MEMBERS, type DemoMember } from './members'

const DEMO_ACHIEVEMENT_KEY = {
  teamVictory: 'team_victory',
  teamLargeBattle: 'team_large_battle',
  teamOutnumberedVictory: 'team_outnumbered_victory',
  participation50: 'individual_participation_50',
  participation100: 'individual_participation_100',
  kill50: 'individual_kill_50',
  kill200: 'individual_kill_200',
  deathless5: 'individual_deathless_5',
} as const

export function demoAchievementsForMember(
  member: DemoMember,
): MemberAchievement[] {
  return member.achievements.flatMap((legacyKey, index) => {
    const achievementKey = DEMO_ACHIEVEMENT_KEY[legacyKey]
    const definition = ACHIEVEMENT_DEFINITIONS.find(
      (candidate) => candidate.key === achievementKey,
    )
    if (!definition) return []
    const evidenceType = achievementKey.startsWith('individual_kill_')
      ? 'official_kill_event'
      : 'official_battle'
    const earnedAt = new Date(
      Date.UTC(2026, 4, 10 + index * 8, 12),
    ).toISOString()
    const evidenceId = `${member.discordId}-${evidenceType}-${index + 1}`
    return [{
      id: `${member.discordId}-${achievementKey}-${index + 1}`,
      achievementKey,
      track: definition.track,
      definitionVersion: definition.definitionVersion,
      evidenceType,
      evidenceId,
      evidence: {
        source:
          evidenceType === 'official_kill_event'
            ? 'guild_battle_stat_events'
            : 'guild_battle_stat_units',
      },
      earnedAt,
      recordedAt: new Date(Date.parse(earnedAt) + 5 * 60 * 1000).toISOString(),
    }]
  })
}

const demoPrimaryMember = DEMO_MEMBERS[0]!
const demoPrimaryAchievements = demoAchievementsForMember(demoPrimaryMember)

export const DEMO_MEMBER_ACHIEVEMENTS: MemberAchievement[] = [
  ...demoPrimaryAchievements,
  {
    id: 'demo-team-victory-repeat',
    achievementKey: 'team_victory',
    track: 'team',
    definitionVersion: 1,
    evidenceType: 'official_battle',
    evidenceId: 'demo-battle-repeat',
    evidence: { source: 'guild_battle_stat_units' },
    earnedAt: '2026-06-21T12:00:00.000Z',
    recordedAt: '2026-06-21T12:05:00.000Z',
  },
]
