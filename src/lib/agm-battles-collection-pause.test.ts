import { describe, expect, it } from 'vitest'
import {
  AGM_BATTLES_COLLECTION_PAUSE_REASON,
  AGM_BATTLES_COLLECTION_PAUSED,
  areAgmBattlesCollectionPaused,
  getAgmBattlesCollectionPausePayload,
  shouldCollectAgmBattles,
} from './agm-battles-collection-pause'

describe('AGM Battles collection pause gate', () => {
  it('keeps public collection independent from active tenant count', () => {
    expect(AGM_BATTLES_COLLECTION_PAUSED).toBe(false)
    expect(AGM_BATTLES_COLLECTION_PAUSE_REASON).toBe('cost_control_no_active_users')
    expect(areAgmBattlesCollectionPaused()).toBe(false)
    expect(shouldCollectAgmBattles()).toBe(true)
  })

  it('returns a stable cron payload for the public collection cron', () => {
    expect(getAgmBattlesCollectionPausePayload('public-battlelog')).toEqual({
      paused: true,
      feature: 'agm-battles-collection',
      area: 'public-battlelog',
      reason: 'cost_control_no_active_users',
      message: 'AGM Battles public collection is paused by the operator kill switch.',
    })
  })
})
