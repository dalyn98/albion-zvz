// Date/time formatters used across review/list UIs. Kept in one place so
// format drift between screens (e.g. month-day vs full-date) stays an
// explicit choice rather than copy-paste accident.
//
// All formatters take an optional `tz` (IANA string) and default to
// Asia/Seoul to keep legacy callers working unchanged. New screens should
// thread the tenant's configured timezone through from app_settings.
import { DEFAULT_TENANT_TIMEZONE, toZonedParts } from '@/lib/timezone'

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatDate(iso: string, tz: string = DEFAULT_TENANT_TIMEZONE): string {
  const p = toZonedParts(iso, tz)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`
}

export function formatDateTime(iso: string, tz: string = DEFAULT_TENANT_TIMEZONE): string {
  const p = toZonedParts(iso, tz)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`
}

// Compact form for space-constrained review lists (omits the year).
export function formatDateTimeShort(iso: string, tz: string = DEFAULT_TENANT_TIMEZONE): string {
  const p = toZonedParts(iso, tz)
  return `${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`
}

// Time-only with seconds; used by combat event logs where second precision matters.
export function formatTime(iso: string, tz: string = DEFAULT_TENANT_TIMEZONE): string {
  const p = toZonedParts(iso, tz)
  return `${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`
}

// Full date+time with seconds; used for confirmation/audit timestamps.
export function formatDateTimeWithSeconds(
  iso: string,
  tz: string = DEFAULT_TENANT_TIMEZONE,
): string {
  const p = toZonedParts(iso, tz)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`
}
