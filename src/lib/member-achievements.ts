import type { SupabaseClient } from '@supabase/supabase-js'

export type AchievementTrack = 'team' | 'individual'
export type AchievementCategory = 'victory' | 'scale' | 'participation' | 'kill' | 'survival'
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'diamond'

export interface AchievementDefinition {
  key: string
  track: AchievementTrack
  category: AchievementCategory
  tier: AchievementTier
  definitionVersion: number
  repeatable: boolean
}

export interface MemberAchievement {
  id: string
  achievementKey: string
  track: AchievementTrack
  definitionVersion: number
  evidenceType: 'official_battle' | 'official_kill_event'
  evidenceId: string
  evidence: Record<string, unknown>
  earnedAt: string
  recordedAt: string
}

export interface AchievementSummary {
  definition: AchievementDefinition
  count: number
  firstEarnedAt: string
  latestEarnedAt: string
  latestEvidenceId: string
}

export const ACHIEVEMENT_DEFINITIONS = [
  {
    key: 'team_victory',
    track: 'team',
    category: 'victory',
    tier: 'gold',
    definitionVersion: 1,
    repeatable: true,
  },
  {
    key: 'team_large_battle',
    track: 'team',
    category: 'scale',
    tier: 'silver',
    definitionVersion: 1,
    repeatable: true,
  },
  {
    key: 'team_outnumbered_victory',
    track: 'team',
    category: 'victory',
    tier: 'diamond',
    definitionVersion: 1,
    repeatable: true,
  },
  ...([10, 50, 100, 300] as const).map((threshold, index) => ({
    key: `individual_participation_${threshold}`,
    track: 'individual' as const,
    category: 'participation' as const,
    tier: (['bronze', 'silver', 'gold', 'diamond'] as const)[index],
    definitionVersion: 1,
    repeatable: false,
  })),
  ...([10, 50, 200, 1000] as const).map((threshold, index) => ({
    key: `individual_kill_${threshold}`,
    track: 'individual' as const,
    category: 'kill' as const,
    tier: (['bronze', 'silver', 'gold', 'diamond'] as const)[index],
    definitionVersion: 1,
    repeatable: false,
  })),
  ...([5, 15, 30] as const).map((threshold, index) => ({
    key: `individual_deathless_${threshold}`,
    track: 'individual' as const,
    category: 'survival' as const,
    tier: (['bronze', 'silver', 'gold'] as const)[index],
    definitionVersion: 1,
    repeatable: false,
  })),
] as const satisfies ReadonlyArray<AchievementDefinition>

function definitionId(key: string, version: number): string {
  return `${key}\u0000${version}`
}

const DEFINITIONS_BY_ID = new Map<string, AchievementDefinition>(
  ACHIEVEMENT_DEFINITIONS.map((definition) => [
    definitionId(definition.key, definition.definitionVersion),
    definition,
  ]),
)

interface AchievementRow {
  id: string
  achievement_key: string
  track: string
  definition_version: number
  evidence_type: string
  evidence_id: string
  evidence: unknown
  earned_at: string
  recorded_at: string
}

export async function loadMemberAchievements(
  db: SupabaseClient,
  guildId: string,
  discordId: string,
): Promise<MemberAchievement[]> {
  const { data, error } = await db
    .from('member_achievements')
    .select(
      'id, achievement_key, track, definition_version, evidence_type, evidence_id, evidence, earned_at, recorded_at',
    )
    .eq('guild_id', guildId)
    .eq('discord_id', discordId)
    .order('earned_at', { ascending: false })
    .order('id', { ascending: false })
  if (error) throw new Error(error.message)

  const achievements: MemberAchievement[] = []
  for (const row of (data ?? []) as AchievementRow[]) {
    const definition = DEFINITIONS_BY_ID.get(
      definitionId(row.achievement_key, row.definition_version),
    )
    if (
      !definition ||
      (row.track !== 'team' && row.track !== 'individual') ||
      definition.track !== row.track ||
      (row.evidence_type !== 'official_battle' &&
        row.evidence_type !== 'official_kill_event')
    ) {
      continue
    }
    achievements.push({
      id: row.id,
      achievementKey: row.achievement_key,
      track: row.track,
      definitionVersion: row.definition_version,
      evidenceType: row.evidence_type,
      evidenceId: row.evidence_id,
      evidence:
        row.evidence && typeof row.evidence === 'object'
          ? (row.evidence as Record<string, unknown>)
          : {},
      earnedAt: row.earned_at,
      recordedAt: row.recorded_at,
    })
  }
  return achievements
}

export function summarizeAchievements(
  achievements: ReadonlyArray<MemberAchievement>,
): AchievementSummary[] {
  const grouped = new Map<string, AchievementSummary>()
  for (const achievement of achievements) {
    const id = definitionId(
      achievement.achievementKey,
      achievement.definitionVersion,
    )
    const definition = DEFINITIONS_BY_ID.get(id)
    if (!definition || definition.track !== achievement.track) continue
    const current = grouped.get(id)
    if (!current) {
      grouped.set(id, {
        definition,
        count: 1,
        firstEarnedAt: achievement.earnedAt,
        latestEarnedAt: achievement.earnedAt,
        latestEvidenceId: achievement.evidenceId,
      })
      continue
    }
    current.count += 1
    if (achievement.earnedAt < current.firstEarnedAt) {
      current.firstEarnedAt = achievement.earnedAt
    }
    if (achievement.earnedAt > current.latestEarnedAt) {
      current.latestEarnedAt = achievement.earnedAt
      current.latestEvidenceId = achievement.evidenceId
    }
  }

  return Array.from(grouped.values()).sort(
    (left, right) =>
      right.latestEarnedAt.localeCompare(left.latestEarnedAt) ||
      left.definition.key.localeCompare(right.definition.key),
  )
}

export async function evaluateMemberAchievements(
  db: SupabaseClient,
  guildId: string,
): Promise<number> {
  const { data, error } = await db.rpc('evaluate_member_achievements', {
    p_guild_id: guildId,
  })
  if (error) throw new Error(error.message)
  const parsed = typeof data === 'number' ? data : Number(data ?? 0)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0
}
