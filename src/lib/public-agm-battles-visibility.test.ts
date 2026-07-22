import { describe, expect, it } from 'vitest'
import { resolvePublicAgmBattlesVisibility } from './public-agm-battles-visibility'

describe('public AGM Battles visibility', () => {
  it('hides navigation and shows an honest pause panel when public collection is paused', () => {
    expect(
      resolvePublicAgmBattlesVisibility({
        battlelogPaused: false,
        publicCollectionPaused: true,
      }),
    ).toEqual({
      isNavigationVisible: false,
      shouldShowPausedPanel: true,
      reason: 'public-collection-paused',
    })
  })

  it('hides navigation when the entire battlelog is paused', () => {
    expect(
      resolvePublicAgmBattlesVisibility({
        battlelogPaused: true,
        publicCollectionPaused: false,
      }),
    ).toEqual({
      isNavigationVisible: false,
      shouldShowPausedPanel: true,
      reason: 'battlelog-paused',
    })
  })

  it('exposes the board only while both battlelog and public collection are active', () => {
    expect(
      resolvePublicAgmBattlesVisibility({
        battlelogPaused: false,
        publicCollectionPaused: false,
      }),
    ).toEqual({
      isNavigationVisible: true,
      shouldShowPausedPanel: false,
      reason: null,
    })
  })
})
