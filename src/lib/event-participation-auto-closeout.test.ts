import { describe, expect, it } from 'vitest'
import {
  EVENT_PARTICIPATION_AUTO_CLOSEOUT_DEFAULT_HOURS,
  normalizeEventParticipationAutoCloseoutHours,
} from './event-participation-auto-closeout'

describe('normalizeEventParticipationAutoCloseoutHours', () => {
  it.each([1, 6, 72])('keeps a supported integer delay: %s', (hours) => {
    expect(normalizeEventParticipationAutoCloseoutHours(hours)).toBe(hours)
  })

  it.each([0, 73, 1.5, 'broken', null])(
    'falls back to the default for an invalid delay: %s',
    (hours) => {
      expect(normalizeEventParticipationAutoCloseoutHours(hours)).toBe(
        EVENT_PARTICIPATION_AUTO_CLOSEOUT_DEFAULT_HOURS,
      )
    },
  )
})
