import { describe, expect, it } from 'vitest'
import {
  getQueueCountTone,
  isVisualRefreshV3Enabled,
  VISUAL_REFRESH_V3_SETTING_KEY,
} from '@/lib/visual-refresh'
import { getTourCoachmarkPosition } from '@/lib/tour-coachmark'

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

describe('getTourCoachmarkPosition', () => {
  it('keeps mobile coachmarks in the CSS bottom-sheet layout', () => {
    expect(getTourCoachmarkPosition({
      top: 100,
      left: 10,
      width: 300,
      height: 80,
      viewportWidth: 390,
      viewportHeight: 844,
    })).toBeUndefined()
  })

  it('anchors desktop coachmarks beside the highlighted reading flow', () => {
    expect(getTourCoachmarkPosition({
      top: 120,
      left: 260,
      width: 600,
      height: 100,
      viewportWidth: 1280,
      viewportHeight: 720,
    })).toEqual({
      top: 234,
      left: 350,
      width: 420,
      right: 'auto',
      bottom: 'auto',
      maxWidth: 'none',
      transform: 'none',
    })
  })

  it('moves above targets that are too close to the viewport bottom', () => {
    expect(getTourCoachmarkPosition({
      top: 600,
      left: 100,
      width: 300,
      height: 80,
      viewportWidth: 1024,
      viewportHeight: 720,
    })).toEqual({
      top: 366,
      left: 40,
      width: 420,
      right: 'auto',
      bottom: 'auto',
      maxWidth: 'none',
      transform: 'none',
    })
  })

  it('keeps coachmark controls visible when the target is outside the viewport', () => {
    const aboveViewport = getTourCoachmarkPosition({
      top: -300,
      left: 100,
      width: 300,
      height: 40,
      viewportWidth: 1024,
      viewportHeight: 720,
    })
    const belowViewport = getTourCoachmarkPosition({
      top: 900,
      left: 100,
      width: 300,
      height: 40,
      viewportWidth: 1024,
      viewportHeight: 720,
    })

    expect(aboveViewport?.top).toBe(12)
    expect(belowViewport?.top).toBe(488)
  })
})
