import { describe, expect, it } from 'vitest'
import { resolveSentryTraceSampleRate } from './sentry-sampling'

describe('resolveSentryTraceSampleRate', () => {
  it('uses fallback for missing or invalid values', () => {
    expect(resolveSentryTraceSampleRate(undefined, 0.02)).toBe(0.02)
    expect(resolveSentryTraceSampleRate('', 0.02)).toBe(0.02)
    expect(resolveSentryTraceSampleRate('not-a-number', 0.02)).toBe(0.02)
  })

  it('clamps configured values into Sentry sample rate bounds', () => {
    expect(resolveSentryTraceSampleRate('-1', 0.02)).toBe(0)
    expect(resolveSentryTraceSampleRate('0.5', 0.02)).toBe(0.5)
    expect(resolveSentryTraceSampleRate('2', 0.02)).toBe(1)
  })
})
