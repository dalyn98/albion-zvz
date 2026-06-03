import { describe, expect, it } from 'vitest'
import {
  DEFAULT_EVENT_REGEAR_POLICY,
  EVENT_REGEAR_MAX_DEATHS_MAX,
  EVENT_REGEAR_MAX_DEATHS_MIN,
  EVENT_REGEAR_SILVER_CAP_MAX,
  EVENT_REGEAR_SILVER_CAP_MIN,
  isEventRegearPolicy,
  resolveManualRegearPolicy,
} from './regear-event-policy'

describe('event-level manual regear policy', () => {
  it('keeps combat events on the role reward policy regardless of stored event policy', () => {
    const resolved = resolveManualRegearPolicy({
      category: '전투',
      eventPolicy: 'event',
      eventSilverCap: 777_000,
      eventMaxDeathsPerMember: 2,
      roleSilver: 1_200_000,
      globalMaxDeaths: 1,
    })

    expect(resolved).toEqual({
      enabled: true,
      source: 'role',
      silverCap: 1_200_000,
      maxDeathsPerMember: 1,
    })
  })

  it('lets FF and ganking events replace the role cap with an event cap', () => {
    const resolved = resolveManualRegearPolicy({
      category: '갱킹',
      eventPolicy: 'event',
      eventSilverCap: 300_000,
      eventMaxDeathsPerMember: 3,
      roleSilver: 0,
      globalMaxDeaths: 1,
    })

    expect(resolved).toEqual({
      enabled: true,
      source: 'event',
      silverCap: 300_000,
      maxDeathsPerMember: 3,
    })
  })

  it('blocks manual regear when a non-combat event is set to disabled', () => {
    const resolved = resolveManualRegearPolicy({
      category: 'FF',
      eventPolicy: 'disabled',
      eventSilverCap: 300_000,
      eventMaxDeathsPerMember: 3,
      roleSilver: 900_000,
      globalMaxDeaths: 2,
    })

    expect(resolved).toEqual({
      enabled: false,
      source: 'disabled',
      silverCap: 0,
      maxDeathsPerMember: 2,
    })
  })

  it('falls back to role policy for unknown persisted policy values', () => {
    const resolved = resolveManualRegearPolicy({
      category: 'FF',
      eventPolicy: 'legacy-value',
      eventSilverCap: 100_000,
      eventMaxDeathsPerMember: 2,
      roleSilver: 500_000,
      globalMaxDeaths: 1,
    })

    expect(resolved.source).toBe(DEFAULT_EVENT_REGEAR_POLICY)
    expect(resolved.silverCap).toBe(500_000)
    expect(resolved.maxDeathsPerMember).toBe(1)
  })

  it('rejects invalid event caps by disabling the event policy result', () => {
    expect(
      resolveManualRegearPolicy({
        category: 'FF',
        eventPolicy: 'event',
        eventSilverCap: EVENT_REGEAR_SILVER_CAP_MIN - 1,
        eventMaxDeathsPerMember: EVENT_REGEAR_MAX_DEATHS_MIN,
        roleSilver: 500_000,
        globalMaxDeaths: 1,
      }),
    ).toMatchObject({ enabled: false, source: 'event', silverCap: 0 })

    expect(
      resolveManualRegearPolicy({
        category: 'FF',
        eventPolicy: 'event',
        eventSilverCap: EVENT_REGEAR_SILVER_CAP_MAX + 1,
        eventMaxDeathsPerMember: EVENT_REGEAR_MAX_DEATHS_MIN,
        roleSilver: 500_000,
        globalMaxDeaths: 1,
      }),
    ).toMatchObject({ enabled: false, source: 'event', silverCap: 0 })

    expect(
      resolveManualRegearPolicy({
        category: 'FF',
        eventPolicy: 'event',
        eventSilverCap: EVENT_REGEAR_SILVER_CAP_MIN,
        eventMaxDeathsPerMember: EVENT_REGEAR_MAX_DEATHS_MAX + 1,
        roleSilver: 500_000,
        globalMaxDeaths: 1,
      }),
    ).toMatchObject({ enabled: false, source: 'event', maxDeathsPerMember: 1 })
  })

  it('narrows policy strings with the whitelist guard', () => {
    expect(isEventRegearPolicy('role')).toBe(true)
    expect(isEventRegearPolicy('event')).toBe(true)
    expect(isEventRegearPolicy('disabled')).toBe(true)
    expect(isEventRegearPolicy('all')).toBe(false)
  })
})
