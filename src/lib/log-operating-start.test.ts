import { describe, expect, it } from 'vitest'
import {
  filterByLogOperatingStart,
  formatLogOperatingStartInput,
  isValidLogOperatingStart,
  parseLogOperatingStart,
} from './log-operating-start'

describe('log operating start', () => {
  it('parses datetime-local values as Albion log UTC time', () => {
    const parsed = parseLogOperatingStart('2026-05-24T17:30', 'Asia/Seoul')

    expect(parsed?.toISOString()).toBe('2026-05-24T17:30:00.000Z')
  })

  it('formats stored ISO values back to UTC datetime-local inputs', () => {
    expect(
      formatLogOperatingStartInput('2026-05-24T08:30:00.000Z', 'Asia/Seoul'),
    ).toBe('2026-05-24T08:30')
  })

  it('rejects impossible wall-clock dates', () => {
    expect(isValidLogOperatingStart('2026-02-31T12:00')).toBe(false)
  })

  it('filters rows before the configured start instant', () => {
    const start = parseLogOperatingStart('2026-05-24T17:30', 'Asia/Seoul')
    const result = filterByLogOperatingStart(
      [
        { at: new Date('2026-05-24T17:29:59.000Z') },
        { at: new Date('2026-05-24T17:30:00.000Z') },
        { at: new Date('2026-05-24T18:00:00.000Z') },
      ],
      (row) => row.at,
      start,
    )

    expect(result.skippedBeforeStart).toBe(1)
    expect(result.entries).toHaveLength(2)
  })
})
