import { describe, expect, it } from 'vitest'
import {
  BATTLELOG_FEATURES_PAUSED,
  BATTLELOG_PAUSE_REASON,
  areBattlelogFeaturesPaused,
  getBattlelogPausePayload,
} from './battlelog-pause'

describe('battlelog pause gate', () => {
  it('keeps battlelog features paused by default during the UI refresh', () => {
    expect(BATTLELOG_FEATURES_PAUSED).toBe(true)
    expect(BATTLELOG_PAUSE_REASON).toBe('ui_ux_refresh')
    expect(areBattlelogFeaturesPaused()).toBe(true)
  })

  it('returns a stable API payload for paused battlelog surfaces', () => {
    expect(getBattlelogPausePayload('killboard-sync')).toEqual({
      paused: true,
      feature: 'battlelog',
      area: 'killboard-sync',
      reason: 'ui_ux_refresh',
      message: 'Battlelog features are temporarily paused while the UI/UX refresh is in progress.',
    })
  })
})
