import { describe, expect, it } from 'vitest'
import {
  computeManualRegearWindowOpenMs,
  computeRegearEligibilityDeadlineMs,
  isRegearEligibilityExpired,
} from './regear-helpers'

describe('manual regear window', () => {
  const battleStartMs = Date.UTC(2026, 7, 11, 12, 0, 0)

  it('opens participant-closeout events as soon as operations start', () => {
    expect(computeManualRegearWindowOpenMs({
      battleStartMs,
      latestEndedMs: 0,
      windowMinutes: 60,
      participantCloseoutRequired: true,
    })).toBe(battleStartMs)
  })

  it('keeps the killboard wait for legacy events', () => {
    expect(computeManualRegearWindowOpenMs({
      battleStartMs,
      latestEndedMs: 0,
      windowMinutes: 60,
      participantCloseoutRequired: false,
    })).toBe(battleStartMs + 60 * 60 * 1000)
  })

  it('opens legacy events when a linked battle ends earlier', () => {
    const endedMs = battleStartMs + 20 * 60 * 1000
    expect(computeManualRegearWindowOpenMs({
      battleStartMs,
      latestEndedMs: endedMs,
      windowMinutes: 60,
      participantCloseoutRequired: false,
    })).toBe(endedMs)
  })
})

describe('regear eligibility deadline', () => {
  it('uses the battle/death anchor plus eligibility days as the deadline', () => {
    const anchor = Date.UTC(2026, 4, 1, 12, 0, 0)

    expect(computeRegearEligibilityDeadlineMs(anchor, 14)).toBe(
      Date.UTC(2026, 4, 15, 12, 0, 0),
    )
  })

  it('treats the exact deadline as still submittable', () => {
    const anchor = Date.UTC(2026, 4, 1, 12, 0, 0)
    const deadline = computeRegearEligibilityDeadlineMs(anchor, 14)

    expect(isRegearEligibilityExpired(anchor, 14, deadline)).toBe(false)
    expect(isRegearEligibilityExpired(anchor, 14, deadline + 1)).toBe(true)
  })
})
