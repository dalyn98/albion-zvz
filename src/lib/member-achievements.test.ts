import { describe, expect, it } from 'vitest'
import {
  ACHIEVEMENT_DEFINITIONS,
  summarizeAchievements,
  type MemberAchievement,
} from './member-achievements'

function achievement(
  key: string,
  evidenceId: string,
  earnedAt: string,
): MemberAchievement {
  const definition = ACHIEVEMENT_DEFINITIONS.find((candidate) => candidate.key === key)
  if (!definition) throw new Error(`unknown definition: ${key}`)
  return {
    id: `${key}:${evidenceId}`,
    achievementKey: key,
    track: definition.track,
    definitionVersion: definition.definitionVersion,
    evidenceType: key.startsWith('individual_kill_')
      ? 'official_kill_event'
      : 'official_battle',
    evidenceId,
    evidence: {},
    earnedAt,
    recordedAt: earnedAt,
  }
}

describe('summarizeAchievements', () => {
  it('groups repeatable team feats without inventing a combined score', () => {
    const summaries = summarizeAchievements([
      achievement('team_victory', 'battle-1', '2026-07-01T00:00:00.000Z'),
      achievement('team_victory', 'battle-2', '2026-07-02T00:00:00.000Z'),
      achievement('individual_kill_10', 'event-10', '2026-07-03T00:00:00.000Z'),
    ])

    expect(summaries.find((summary) => summary.definition.key === 'team_victory')).toMatchObject({
      count: 2,
      firstEarnedAt: '2026-07-01T00:00:00.000Z',
      latestEarnedAt: '2026-07-02T00:00:00.000Z',
      latestEvidenceId: 'battle-2',
    })
    expect(summaries).toHaveLength(2)
  })

  it('keeps key and definition version paired at the presentation boundary', () => {
    const unknownKey = achievement(
      'team_victory',
      'battle-1',
      '2026-07-01T00:00:00.000Z',
    )
    unknownKey.achievementKey = 'future_definition'
    const unknownVersion = achievement(
      'team_victory',
      'battle-2',
      '2026-07-02T00:00:00.000Z',
    )
    unknownVersion.definitionVersion = 2

    expect(summarizeAchievements([unknownKey, unknownVersion])).toEqual([])
  })
})
