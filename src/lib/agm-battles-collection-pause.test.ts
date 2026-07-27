import { describe, expect, it } from 'vitest'
import {
  AGM_BATTLES_COLLECTION_PAUSE_REASON,
  AGM_BATTLES_COLLECTION_PAUSED,
  areAgmBattlesCollectionPaused,
  getAgmBattlesCollectionPausePayload,
  shouldCollectAgmBattles,
} from './agm-battles-collection-pause'

describe('AGM Battles collection pause gate', () => {
  it('keeps the public board available and gates collection by active tenants', () => {
    expect(AGM_BATTLES_COLLECTION_PAUSED).toBe(false)
    expect(AGM_BATTLES_COLLECTION_PAUSE_REASON).toBe('cost_control_no_active_users')
    expect(areAgmBattlesCollectionPaused()).toBe(false)
    expect(shouldCollectAgmBattles(0)).toBe(false)
    expect(shouldCollectAgmBattles(1)).toBe(true)
    expect(shouldCollectAgmBattles(Number.NaN)).toBe(false)
  })

  it('returns a stable cron payload for the public collection cron', () => {
    expect(getAgmBattlesCollectionPausePayload('public-battlelog')).toEqual({
      paused: true,
      feature: 'agm-battles-collection',
      area: 'public-battlelog',
      reason: 'cost_control_no_active_users',
      message: 'AGM Battles public collection is paused to avoid unnecessary cost while there are no active users.',
    })
  })
})
