import { describe, expect, it } from 'vitest'
import {
  EXCHANGE_GAMEPLAY_VIDEO_WINDOW_DAYS,
  gameplayVideoEligibleUntil,
  hasRecentGameplayVideo,
} from './member-gameplay-video'

describe('member gameplay video exchange eligibility', () => {
  it('keeps an upload eligible for exactly five days', () => {
    expect(EXCHANGE_GAMEPLAY_VIDEO_WINDOW_DAYS).toBe(5)
    expect(gameplayVideoEligibleUntil('2026-07-20T12:00:00.000Z')).toBe(
      '2026-07-25T12:00:00.000Z',
    )
    expect(hasRecentGameplayVideo(
      '2026-07-20T12:00:00.000Z',
      new Date('2026-07-25T12:00:00.000Z'),
    )).toBe(true)
    expect(hasRecentGameplayVideo(
      '2026-07-20T12:00:00.000Z',
      new Date('2026-07-25T12:00:00.001Z'),
    )).toBe(false)
  })

  it('rejects missing or invalid upload timestamps', () => {
    expect(gameplayVideoEligibleUntil('invalid')).toBeNull()
    expect(hasRecentGameplayVideo(null)).toBe(false)
    expect(hasRecentGameplayVideo('invalid')).toBe(false)
  })
})
