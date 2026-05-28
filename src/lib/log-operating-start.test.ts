import { describe, expect, it } from 'vitest'
import {
  filterByLogOperatingStart,
  formatLogOperatingStartInput,
  isValidLogOperatingStart,
  parseLogOperatingStart,
  parseStoredLogOperatingStart,
} from './log-operating-start'

describe('log operating start', () => {
  it('parses datetime-local values as guild wall-clock time and returns UTC', () => {
    const parsed = parseLogOperatingStart('2026-05-24T17:30', 'Asia/Seoul')

    expect(parsed?.toISOString()).toBe('2026-05-24T08:30:00.000Z')
  })

  it('keeps UTC datetime-local values unchanged for UTC guilds', () => {
    const parsed = parseLogOperatingStart('2026-05-24T17:30', 'UTC')

    expect(parsed?.toISOString()).toBe('2026-05-24T17:30:00.000Z')
  })

  it('formats stored ISO values back to guild-time datetime-local inputs', () => {
    expect(
      formatLogOperatingStartInput('2026-05-24T08:30:00.000Z', 'Asia/Seoul'),
    ).toBe('2026-05-24T17:30')
  })

  it('keeps legacy bare stored values as UTC before formatting for guild time', () => {
    expect(
      parseStoredLogOperatingStart('2026-05-24T17:30')?.toISOString(),
    ).toBe('2026-05-24T17:30:00.000Z')
    expect(
      formatLogOperatingStartInput('2026-05-24T17:30', 'Asia/Seoul'),
    ).toBe('2026-05-25T02:30')
  })

  it('rejects impossible wall-clock dates', () => {
    expect(isValidLogOperatingStart('2026-02-31T12:00')).toBe(false)
    expect(parseStoredLogOperatingStart('2026-02-31T12:00')).toBeNull()
  })

  it('filters rows before the configured start instant', () => {
    const start = parseLogOperatingStart('2026-05-24T17:30', 'Asia/Seoul')
    const result = filterByLogOperatingStart(
      [
        { at: new Date('2026-05-24T08:29:59.000Z') },
        { at: new Date('2026-05-24T08:30:00.000Z') },
        { at: new Date('2026-05-24T09:00:00.000Z') },
      ],
      (row) => row.at,
      start,
    )

    expect(result.skippedBeforeStart).toBe(1)
    expect(result.entries).toHaveLength(2)
  })
})
