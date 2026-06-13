import type { AlbionBattle } from '@/lib/albion-battles'

export interface BattleTrackingSubject {
  homeGuildId: string
  homeAllianceId: string | null
}

function normalizedId(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : null
}

export function isBattleRelevantToTrackingSubject(
  battle: AlbionBattle,
  subject: BattleTrackingSubject,
): boolean {
  const homeGuildId = normalizedId(subject.homeGuildId)
  if (!homeGuildId) return false
  if (battle.guilds?.[homeGuildId]) return true

  const homeAllianceId = normalizedId(subject.homeAllianceId)
  if (!homeAllianceId) return false
  return Object.values(battle.guilds ?? {}).some(
    (guild) => guild.allianceId === homeAllianceId,
  )
}

export function filterBattlesRelevantToTrackingSubjects(
  battles: readonly AlbionBattle[],
  subjects: readonly BattleTrackingSubject[],
): AlbionBattle[] {
  if (battles.length === 0 || subjects.length === 0) return []
  return battles.filter((battle) =>
    subjects.some((subject) => isBattleRelevantToTrackingSubject(battle, subject)),
  )
}
