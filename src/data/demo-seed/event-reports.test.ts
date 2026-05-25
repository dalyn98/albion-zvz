import { describe, expect, it } from 'vitest'
import { DEMO_EVENTS } from './events'
import { getDemoEventReport } from './event-reports'

describe('demo event reports', () => {
  it('provides reports for every demo event detail that exposes a report link', () => {
    const reportableEvents = DEMO_EVENTS.filter((event) => event.battleStarted)

    expect(reportableEvents.map((event) => event.id)).toEqual(['evt-4', 'evt-5'])
    for (const event of reportableEvents) {
      expect(getDemoEventReport(event.id)?.eventId).toBe(event.id)
    }
  })

  it('does not expose a report for upcoming demo events', () => {
    expect(getDemoEventReport('evt-1')).toBeNull()
  })
})
