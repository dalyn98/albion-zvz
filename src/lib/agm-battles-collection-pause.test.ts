import { describe, expect, it } from 'vitest'
import {
  AGM_BATTLES_COLLECTION_PAUSE_REASON,
  AGM_BATTLES_COLLECTION_PAUSED,
  areAgmBattlesCollectionPaused,
  getAgmBattlesCollectionPausePayload,
} from './agm-battles-collection-pause'

describe('AGM Battles collection pause gate', () => {
  it('pauses only the public AGM Battles collection by default', () => {
    expect(AGM_BATTLES_COLLECTION_PAUSED).toBe(true)
    expect(AGM_BATTLES_COLLECTION_PAUSE_REASON).toBe('cost_control_no_active_users')
    expect(areAgmBattlesCollectionPaused()).toBe(true)
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
