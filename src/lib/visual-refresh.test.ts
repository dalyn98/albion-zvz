import { describe, expect, it } from 'vitest'
import {
  getQueueCountTone,
  isVisualRefreshV3Enabled,
  VISUAL_REFRESH_V3_SETTING_KEY,
} from '@/lib/visual-refresh'

describe('visual refresh v3 rollout', () => {
  it('uses a dedicated tenant setting and enables only the exact true value', () => {
    expect(VISUAL_REFRESH_V3_SETTING_KEY).toBe('visual_refresh_v3_enabled')
    expect(isVisualRefreshV3Enabled('true')).toBe(true)
    expect(isVisualRefreshV3Enabled('false')).toBe(false)
    expect(isVisualRefreshV3Enabled('TRUE')).toBe(false)
    expect(isVisualRefreshV3Enabled('')).toBe(false)
  })

  it('reserves danger styling for overdue work instead of every non-zero queue', () => {
    expect(getQueueCountTone({ count: 0, isOverdue: false })).toBe('neutral')
    expect(getQueueCountTone({ count: 3, isOverdue: false })).toBe('attention')
    expect(getQueueCountTone({ count: 3, isOverdue: true })).toBe('danger')
  })
})
