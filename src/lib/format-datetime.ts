// KST-based date/time formatters used across review/list UIs.
// Kept in one place so format drift between screens (e.g. month-day vs full-date)
// stays an explicit choice rather than copy-paste accident.
//
// All formatters render in KST regardless of server/browser TZ — Albion's KR
// server operates on KST, so events and related timestamps always show KST.
// KST has no DST, so a fixed +9h offset is safe.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

interface KstParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function toKstParts(iso: string): KstParts {
  const d = new Date(iso)
  const shifted = new Date(d.getTime() + KST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}

export function formatDate(iso: string): string {
  const p = toKstParts(iso)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`
}

export function formatDateTime(iso: string): string {
  const p = toKstParts(iso)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`
}

// Compact form for space-constrained review lists (omits the year).
export function formatDateTimeShort(iso: string): string {
  const p = toKstParts(iso)
  return `${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`
}
