// Local-time date/time formatters used across review/list UIs.
// Kept in one place so format drift between screens (e.g. month-day vs full-date)
// stays an explicit choice rather than copy-paste accident.
//
// All formatters render in the browser/server's local TZ. The app stores ISO
// strings (UTC) in DB and renders local; admin/users are KST so this matches.

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${formatDate(iso)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

// Compact form for space-constrained review lists (omits the year).
export function formatDateTimeShort(iso: string): string {
  const d = new Date(iso)
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}
