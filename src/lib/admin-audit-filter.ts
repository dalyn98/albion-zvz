import { zonedPartsToUtc } from '@/lib/timezone'

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

interface CalendarDate {
  year: number
  month: number
  day: number
}

function parseCalendarDate(value: string): CalendarDate | undefined {
  const match = DATE_PATTERN.exec(value)
  if (!match) return undefined

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return undefined
  }

  return { year, month, day }
}

export function resolveAuditDate(value: string | undefined): string | undefined {
  if (!value) return undefined
  return parseCalendarDate(value) ? value : undefined
}

export function auditDateBoundaryUtc(
  value: string,
  timezone: string,
  boundary: 'start' | 'end',
): string {
  const parsed = parseCalendarDate(value)
  if (!parsed) throw new Error('Invalid audit calendar date')

  if (boundary === 'start') {
    return zonedPartsToUtc({ ...parsed, hour: 0, minute: 0 }, timezone).toISOString()
  }

  const nextDay = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + 1))
  const nextBoundary = zonedPartsToUtc(
    {
      year: nextDay.getUTCFullYear(),
      month: nextDay.getUTCMonth() + 1,
      day: nextDay.getUTCDate(),
      hour: 0,
      minute: 0,
    },
    timezone,
  )
  return new Date(nextBoundary.getTime() - 1).toISOString()
}
