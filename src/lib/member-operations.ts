const DAY_MS = 24 * 60 * 60 * 1_000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_TRIAL_DAYS = 180
const MAX_ABSENCE_DAYS = 90
const MAX_TRIAL_NOTES_LENGTH = 500
const MAX_ABSENCE_REASON_LENGTH = 240

export type MemberTrialStatus = 'trial' | 'accepted' | 'rejected'

export interface EventMemberAbsenceConflict {
  id: string
  discordId: string
  displayName: string
  startsOn: string
  endsOn: string
  reason: string
}

export interface MemberTrialInput {
  status: unknown
  startedOn: unknown
  reviewDueOn: unknown
  notes: unknown
}

export interface MemberTrialValue {
  status: MemberTrialStatus
  startedOn: string
  reviewDueOn: string
  notes: string
}

export type MemberTrialResult =
  | { ok: true; value: MemberTrialValue }
  | { ok: false; code: 'invalidStatus' | 'invalidDate' | 'invalidRange' | 'rangeTooLong' }

export interface MemberAbsenceInput {
  startsOn: unknown
  endsOn: unknown
  reason: unknown
}

export interface MemberAbsenceValue {
  startsOn: string
  endsOn: string
  reason: string
}

export type MemberAbsenceResult =
  | { ok: true; value: MemberAbsenceValue }
  | {
      ok: false
      code: 'invalidDate' | 'invalidRange' | 'rangeTooLong' | 'pastRange'
    }

function plainDateMs(value: unknown): number | null {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return null
  const parsed = Date.parse(`${value}T00:00:00.000Z`)
  if (!Number.isFinite(parsed)) return null
  return new Date(parsed).toISOString().slice(0, 10) === value ? parsed : null
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function normalizeMemberTrial(input: MemberTrialInput): MemberTrialResult {
  if (input.status !== 'trial' && input.status !== 'accepted' && input.status !== 'rejected') {
    return { ok: false, code: 'invalidStatus' }
  }
  const startedMs = plainDateMs(input.startedOn)
  const reviewDueMs = plainDateMs(input.reviewDueOn)
  if (startedMs === null || reviewDueMs === null) {
    return { ok: false, code: 'invalidDate' }
  }
  if (reviewDueMs < startedMs) return { ok: false, code: 'invalidRange' }
  if ((reviewDueMs - startedMs) / DAY_MS > MAX_TRIAL_DAYS) {
    return { ok: false, code: 'rangeTooLong' }
  }
  return {
    ok: true,
    value: {
      status: input.status,
      startedOn: input.startedOn as string,
      reviewDueOn: input.reviewDueOn as string,
      notes: cleanText(input.notes, MAX_TRIAL_NOTES_LENGTH),
    },
  }
}

export function normalizeMemberAbsence(
  input: MemberAbsenceInput,
  todayIso: string,
): MemberAbsenceResult {
  const startsMs = plainDateMs(input.startsOn)
  const endsMs = plainDateMs(input.endsOn)
  const todayMs = plainDateMs(todayIso)
  if (startsMs === null || endsMs === null || todayMs === null) {
    return { ok: false, code: 'invalidDate' }
  }
  if (endsMs < startsMs) return { ok: false, code: 'invalidRange' }
  if ((endsMs - startsMs) / DAY_MS >= MAX_ABSENCE_DAYS) {
    return { ok: false, code: 'rangeTooLong' }
  }
  if (endsMs < todayMs) return { ok: false, code: 'pastRange' }
  return {
    ok: true,
    value: {
      startsOn: input.startsOn as string,
      endsOn: input.endsOn as string,
      reason: cleanText(input.reason, MAX_ABSENCE_REASON_LENGTH),
    },
  }
}

export function absenceOverlapsDate(
  absence: { startsOn: string; endsOn: string },
  dateIso: string,
): boolean {
  const startsMs = plainDateMs(absence.startsOn)
  const endsMs = plainDateMs(absence.endsOn)
  const dateMs = plainDateMs(dateIso)
  if (startsMs === null || endsMs === null || dateMs === null) return false
  return dateMs >= startsMs && dateMs <= endsMs
}
