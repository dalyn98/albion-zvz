import { describe, expect, it } from 'vitest'
import {
  ACHIEVEMENT_DEFINITIONS,
  summarizeAchievements,
} from '@/lib/member-achievements'
import {
  DEMO_MEMBER_ACHIEVEMENTS,
  demoAchievementsForMember,
} from './achievements'
import { DEMO_MEMBERS } from './members'

describe('demo member achievements', () => {
  it('converts every legacy demo marker into a versioned evidence record', () => {
    const definitionIds = new Set(
      ACHIEVEMENT_DEFINITIONS.map(
        (definition) =>
          `${definition.key}:${definition.definitionVersion}`,
      ),
    )
    const records = DEMO_MEMBERS.flatMap(demoAchievementsForMember)

    expect(records).toHaveLength(
      DEMO_MEMBERS.reduce(
        (sum, member) => sum + member.achievements.length,
        0,
      ),
    )
    expect(new Set(records.map((record) => record.id)).size).toBe(records.length)
    for (const record of records) {
      expect(
        definitionIds.has(
          `${record.achievementKey}:${record.definitionVersion}`,
        ),
      ).toBe(true)
      expect(record.evidenceId).not.toBe('')
      expect(Date.parse(record.earnedAt)).not.toBeNaN()
      expect(Date.parse(record.recordedAt)).toBeGreaterThanOrEqual(
        Date.parse(record.earnedAt),
      )
    }
  })

  it('preserves repeat team feats as distinct evidence with one summary', () => {
    const victory = summarizeAchievements(DEMO_MEMBER_ACHIEVEMENTS).find(
      (summary) => summary.definition.key === 'team_victory',
    )

    expect(victory?.count).toBe(2)
    expect(
      new Set(
        DEMO_MEMBER_ACHIEVEMENTS.map((achievement) => achievement.evidenceId),
      ).size,
    ).toBe(DEMO_MEMBER_ACHIEVEMENTS.length)
  })
})
