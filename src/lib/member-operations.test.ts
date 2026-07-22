import { describe, expect, it } from 'vitest'
import {
  absenceOverlapsDate,
  normalizeMemberAbsence,
  normalizeMemberTrial,
} from './member-operations'

describe('normalizeMemberTrial', () => {
  it('accepts a bounded trial window and trims notes', () => {
    expect(normalizeMemberTrial({
      status: 'trial',
      startedOn: '2026-07-22',
      reviewDueOn: '2026-08-05',
      notes: '  Caller trial · review comms  ',
    })).toEqual({
      ok: true,
      value: {
        status: 'trial',
        startedOn: '2026-07-22',
        reviewDueOn: '2026-08-05',
        notes: 'Caller trial · review comms',
      },
    })
  })

  it('rejects invalid, reversed, and unbounded trial windows', () => {
    expect(normalizeMemberTrial({
      status: 'trial',
      startedOn: '2026-02-30',
      reviewDueOn: '2026-03-01',
      notes: '',
    })).toEqual({ ok: false, code: 'invalidDate' })
    expect(normalizeMemberTrial({
      status: 'accepted',
      startedOn: '2026-08-05',
      reviewDueOn: '2026-07-22',
      notes: '',
    })).toEqual({ ok: false, code: 'invalidRange' })
    expect(normalizeMemberTrial({
      status: 'rejected',
      startedOn: '2026-01-01',
      reviewDueOn: '2026-08-01',
      notes: '',
    })).toEqual({ ok: false, code: 'rangeTooLong' })
  })
})

describe('normalizeMemberAbsence', () => {
  it('accepts an active or future absence of at most 90 days', () => {
    expect(normalizeMemberAbsence({
      startsOn: '2026-07-22',
      endsOn: '2026-08-02',
      reason: '  family trip  ',
    }, '2026-07-22')).toEqual({
      ok: true,
      value: {
        startsOn: '2026-07-22',
        endsOn: '2026-08-02',
        reason: 'family trip',
      },
    })
  })

  it('rejects past, reversed, or overlong absences', () => {
    expect(normalizeMemberAbsence({
      startsOn: '2026-07-01',
      endsOn: '2026-07-21',
      reason: '',
    }, '2026-07-22')).toEqual({ ok: false, code: 'pastRange' })
    expect(normalizeMemberAbsence({
      startsOn: '2026-08-02',
      endsOn: '2026-07-22',
      reason: '',
    }, '2026-07-22')).toEqual({ ok: false, code: 'invalidRange' })
    expect(normalizeMemberAbsence({
      startsOn: '2026-07-22',
      endsOn: '2026-10-21',
      reason: '',
    }, '2026-07-22')).toEqual({ ok: false, code: 'rangeTooLong' })
  })

  it('matches an event date inclusively', () => {
    expect(absenceOverlapsDate({ startsOn: '2026-07-22', endsOn: '2026-07-25' }, '2026-07-22')).toBe(true)
    expect(absenceOverlapsDate({ startsOn: '2026-07-22', endsOn: '2026-07-25' }, '2026-07-25')).toBe(true)
    expect(absenceOverlapsDate({ startsOn: '2026-07-22', endsOn: '2026-07-25' }, '2026-07-26')).toBe(false)
  })
})
