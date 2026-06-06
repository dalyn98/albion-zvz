import { describe, expect, it } from 'vitest'
import { shouldRunIdleCron } from './cron-cost-control'

describe('shouldRunIdleCron', () => {
  const nowMs = Date.parse('2026-06-06T00:00:00.000Z')

  it('always runs when forced or inside an activity window', () => {
    expect(
      shouldRunIdleCron({
        force: true,
        hasActivity: false,
        lastRunAt: new Date(nowMs - 1).toISOString(),
        nowMs,
        idleIntervalMs: 60_000,
      }),
    ).toMatchObject({ run: true, reason: 'forced' })

    expect(
      shouldRunIdleCron({
        force: false,
        hasActivity: true,
        lastRunAt: new Date(nowMs - 1).toISOString(),
        nowMs,
        idleIntervalMs: 60_000,
      }),
    ).toMatchObject({ run: true, reason: 'activity-window' })
  })

  it('runs idle jobs when there is no previous successful timestamp', () => {
    expect(
      shouldRunIdleCron({
        force: false,
        hasActivity: false,
        lastRunAt: '',
        nowMs,
        idleIntervalMs: 60_000,
      }),
    ).toMatchObject({ run: true, reason: 'no-previous-run' })
  })

  it('throttles idle jobs until the interval elapses', () => {
    expect(
      shouldRunIdleCron({
        force: false,
        hasActivity: false,
        lastRunAt: new Date(nowMs - 59_000).toISOString(),
        nowMs,
        idleIntervalMs: 60_000,
      }),
    ).toMatchObject({ run: false, reason: 'idle-throttle', ageMs: 59_000 })

    expect(
      shouldRunIdleCron({
        force: false,
        hasActivity: false,
        lastRunAt: new Date(nowMs - 60_000).toISOString(),
        nowMs,
        idleIntervalMs: 60_000,
      }),
    ).toMatchObject({ run: true, reason: 'idle-interval-elapsed', ageMs: 60_000 })
  })
})
