import type { AppSettingKey } from '@/lib/app-settings'
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'

export type LogOperatingStartDomain = 'shopChest' | 'siphon'

export const LOG_OPERATING_START_KEYS = {
  shopChest: 'log_start_shop_chest_at',
  siphon: 'log_start_siphon_at',
} as const satisfies Record<LogOperatingStartDomain, AppSettingKey>

const LOCAL_DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/

export function parseLogOperatingStart(
  raw: string,
  timezone: string = DEFAULT_TENANT_TIMEZONE,
): Date | null {
  void timezone
  const value = raw.trim()
  if (!value) return null

  const local = value.match(LOCAL_DATE_TIME_RE)
  if (local) {
    const [, yyyy, mm, dd, hh, min, ss] = local
    const parts = {
      year: Number(yyyy),
      month: Number(mm),
      day: Number(dd),
      hour: Number(hh),
      minute: Number(min),
      second: ss ? Number(ss) : 0,
    }
    if (!isValidWallClockParts(parts)) return null
    return new Date(
      Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
      ),
    )
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function isValidLogOperatingStart(
  raw: string,
  timezone: string = DEFAULT_TENANT_TIMEZONE,
): boolean {
  return parseLogOperatingStart(raw, timezone) !== null
}

export function formatLogOperatingStartInput(
  raw: string,
  timezone: string = DEFAULT_TENANT_TIMEZONE,
): string {
  void timezone
  const parsed = parseLogOperatingStart(raw, timezone)
  if (!parsed) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  const date = [
    parsed.getUTCFullYear(),
    pad(parsed.getUTCMonth() + 1),
    pad(parsed.getUTCDate()),
  ].join('-')
  return `${date}T${pad(parsed.getUTCHours())}:${pad(parsed.getUTCMinutes())}`
}

export function filterByLogOperatingStart<T>(
  entries: readonly T[],
  getLoggedAt: (entry: T) => Date,
  startAt: Date | null,
): { entries: T[]; skippedBeforeStart: number } {
  if (!startAt) return { entries: [...entries], skippedBeforeStart: 0 }

  const startMs = startAt.getTime()
  const filtered: T[] = []
  let skippedBeforeStart = 0
  for (const entry of entries) {
    if (getLoggedAt(entry).getTime() < startMs) {
      skippedBeforeStart += 1
      continue
    }
    filtered.push(entry)
  }
  return { entries: filtered, skippedBeforeStart }
}

function isValidWallClockParts(parts: {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second?: number
}): boolean {
  if (!Number.isInteger(parts.year) || parts.year < 1970 || parts.year > 2100) {
    return false
  }
  if (!Number.isInteger(parts.month) || parts.month < 1 || parts.month > 12) {
    return false
  }
  const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate()
  if (!Number.isInteger(parts.day) || parts.day < 1 || parts.day > lastDay) {
    return false
  }
  if (!Number.isInteger(parts.hour) || parts.hour < 0 || parts.hour > 23) {
    return false
  }
  if (!Number.isInteger(parts.minute) || parts.minute < 0 || parts.minute > 59) {
    return false
  }
  if (
    parts.second !== undefined &&
    (!Number.isInteger(parts.second) || parts.second < 0 || parts.second > 59)
  ) {
    return false
  }
  return true
}
