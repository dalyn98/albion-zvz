import { describe, expect, it } from 'vitest'
import {
  EVENT_OPERATIONAL_DURATION_MS,
  isOperationallyEnded,
  resolveManualOperationalStartIso,
  resolveOperationalEndIso,
} from './event-operational-state'

describe('event operational state', () => {
  const startedAt = '2026-07-31T01:00:00.000Z'

  it('uses now only for a true early start and preserves overdue gather time', () => {
    const nowMs = Date.parse('2026-07-31T02:00:00.000Z')
    expect(resolveManualOperationalStartIso({
      gatherAt: '2026-07-31T03:00:00.000Z',
      nowMs,
    })).toBe('2026-07-31T02:00:00.000Z')
    expect(resolveManualOperationalStartIso({
      gatherAt: '2026-07-31T01:00:00.000Z',
      nowMs,
    })).toBe('2026-07-31T01:00:00.000Z')
  })

  it('prefers the persisted end boundary', () => {
    expect(resolveOperationalEndIso({
      battle_started_at: startedAt,
      operational_ended_at: '2026-07-31T03:00:00.000Z',
    })).toBe('2026-07-31T03:00:00.000Z')
  })

  it('keeps legacy rows compatible with the one-hour boundary', () => {
    expect(resolveOperationalEndIso({ battle_started_at: startedAt })).toBe(
      new Date(Date.parse(startedAt) + EVENT_OPERATIONAL_DURATION_MS).toISOString(),
    )
  })

  it('does not treat missing or invalid starts as ended', () => {
    expect(isOperationallyEnded({}, Date.parse('2026-08-01T00:00:00Z'))).toBe(false)
    expect(isOperationallyEnded(
      { battle_started_at: 'invalid' },
      Date.parse('2026-08-01T00:00:00Z'),
    )).toBe(false)
  })

  it('ends exactly at the persisted operational boundary', () => {
    const event = {
      battle_started_at: startedAt,
      operational_ended_at: '2026-07-31T02:00:00.000Z',
    }
    expect(isOperationallyEnded(event, Date.parse('2026-07-31T01:59:59.999Z'))).toBe(false)
    expect(isOperationallyEnded(event, Date.parse('2026-07-31T02:00:00.000Z'))).toBe(true)
  })
})
