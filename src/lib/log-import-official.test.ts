import { describe, expect, it } from 'vitest'
import { selectOfficialLogEntries } from './log-import-official'

describe('selectOfficialLogEntries', () => {
  it('returns official entries and a reusable operating-start summary', () => {
    const startAt = new Date('2026-05-24T05:00:00.000Z')
    const entries = [
      { loggedAt: new Date('2026-05-24T04:59:59.000Z'), value: 'old' },
      { loggedAt: new Date('2026-05-24T05:00:00.000Z'), value: 'start' },
      { loggedAt: new Date('2026-05-24T05:01:00.000Z'), value: 'new' },
    ]

    const result = selectOfficialLogEntries(entries, (entry) => entry.loggedAt, startAt)

    expect(result.operatingStartAt).toBe('2026-05-24T05:00:00.000Z')
    expect(result.skippedBeforeStart).toBe(1)
    expect(result.entries.map((entry) => entry.value)).toEqual(['start', 'new'])
  })
})

