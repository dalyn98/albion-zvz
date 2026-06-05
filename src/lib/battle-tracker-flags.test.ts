import { describe, expect, it } from 'vitest'
import {
  resolveBattleTrackerProjectionDiffSyncEnabled,
  resolveBattleTrackerShadowSyncEnabled,
} from './battle-tracker-flags'

describe('resolveBattleTrackerShadowSyncEnabled', () => {
  it('defaults to enabled because /battles now reads battle_view_projections', () => {
    expect(resolveBattleTrackerShadowSyncEnabled(null, undefined)).toBe(true)
  })

  it('allows explicit query or env kill switches for emergency rollback', () => {
    expect(resolveBattleTrackerShadowSyncEnabled('0', undefined)).toBe(false)
    expect(resolveBattleTrackerShadowSyncEnabled(null, 'false')).toBe(false)
    expect(resolveBattleTrackerShadowSyncEnabled('1', 'false')).toBe(true)
  })
})

describe('resolveBattleTrackerProjectionDiffSyncEnabled', () => {
  it('keeps projection diffs opt-in after shadow sync is enabled', () => {
    expect(resolveBattleTrackerProjectionDiffSyncEnabled(null, undefined, true)).toBe(false)
    expect(resolveBattleTrackerProjectionDiffSyncEnabled(null, 'true', true)).toBe(true)
  })

  it('never runs projection diffs when shadow sync is disabled', () => {
    expect(resolveBattleTrackerProjectionDiffSyncEnabled('1', 'true', false)).toBe(false)
  })
})
