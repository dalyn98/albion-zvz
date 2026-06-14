import { describe, expect, it } from 'vitest'
import {
  isAssetLoadError,
  shouldRefreshLongLivedTab,
  shouldReloadForAssetError,
} from './long-lived-tab-refresh'

describe('long-lived tab refresh', () => {
  it('refreshes only after the stale threshold has elapsed', () => {
    expect(shouldRefreshLongLivedTab(1_000, 1_000 + 29 * 60_000, 30 * 60_000))
      .toBe(false)
    expect(shouldRefreshLongLivedTab(1_000, 1_000 + 30 * 60_000, 30 * 60_000))
      .toBe(true)
  })

  it('recognizes chunk and dynamic import failures after a new deployment', () => {
    expect(isAssetLoadError(new Error('ChunkLoadError: Loading chunk 123 failed.')))
      .toBe(true)
    expect(isAssetLoadError('TypeError: Failed to fetch dynamically imported module'))
      .toBe(true)
    expect(isAssetLoadError(new Error('ordinary form validation error')))
      .toBe(false)
  })

  it('throttles asset reloads to avoid reload loops', () => {
    const error = new Error('ChunkLoadError: Loading chunk app failed.')

    expect(shouldReloadForAssetError({ error, lastReloadAt: 0, now: 60_000, throttleMs: 60_000 }))
      .toBe(true)
    expect(shouldReloadForAssetError({ error, lastReloadAt: 50_000, now: 60_000, throttleMs: 60_000 }))
      .toBe(false)
    expect(shouldReloadForAssetError({
      error: new Error('unrelated'),
      lastReloadAt: 0,
      now: 60_000,
      throttleMs: 60_000,
    })).toBe(false)
  })
})
