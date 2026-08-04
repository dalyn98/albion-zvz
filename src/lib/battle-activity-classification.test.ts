import { describe, expect, it } from 'vitest'
import {
  DISARRAY_FORCE_MIN_SIZE,
  battleActivityViewPolicy,
  classifyBattleActivity,
} from './battle-activity-classification'

describe('classifyBattleActivity', () => {
  it('treats exact 20v20 sustained mutual fights as ZvZ', () => {
    expect(DISARRAY_FORCE_MIN_SIZE).toBe(20)
    expect(
      classifyBattleActivity({
        subjectTeamSize: DISARRAY_FORCE_MIN_SIZE,
        opponentTeamSize: DISARRAY_FORCE_MIN_SIZE,
        subjectKills: 7,
        subjectDeaths: 5,
        opponentKills: 5,
        opponentDeaths: 7,
        battleDurationSeconds: 240,
      }),
    ).toMatchObject({
      kind: 'zvz',
      reason: 'disarray_scale_mutual_or_sustained',
    })
  })

  it('keeps 19v19 mutual fights out of the default ZvZ surface', () => {
    expect(
      classifyBattleActivity({
        subjectTeamSize: 19,
        opponentTeamSize: 19,
        subjectKills: 5,
        subjectDeaths: 4,
        opponentKills: 4,
        opponentDeaths: 5,
        battleDurationSeconds: 180,
      }).kind,
    ).toBe('smallscale')
  })

  it('classifies a 20-person one-sided catch as ganking', () => {
    expect(
      classifyBattleActivity({
        subjectTeamSize: 20,
        opponentTeamSize: 18,
        subjectKills: 6,
        subjectDeaths: 0,
        opponentKills: 0,
        opponentDeaths: 6,
        battleDurationSeconds: 45,
      }),
    ).toMatchObject({
      kind: 'ganking',
      reason: 'zerg_party_vs_fragmented_opposition',
    })
  })

  it('classifies zerg parties farming scattered victims as ganking', () => {
    expect(
      classifyBattleActivity({
        subjectTeamSize: 35,
        opponentTeamSize: 12,
        subjectKills: 4,
        subjectDeaths: 0,
        opponentKills: 0,
        opponentDeaths: 4,
        battleDurationSeconds: 75,
        opponentForceCount: 6,
        smallOpponentForceCount: 5,
      }).kind,
    ).toBe('ganking')
  })

  it('maps only ZvZ to the default view policy', () => {
    expect(battleActivityViewPolicy('zvz')).toBe('default_meaningful')
    expect(battleActivityViewPolicy('ganking')).toBe('small_or_low_engagement')
    expect(battleActivityViewPolicy('smallscale')).toBe('small_or_low_engagement')
  })
})
