export interface GatherTimeParts {
  month: number
  day: number
  hour: number
  minute: number
}

const IMMINENT_WINDOW_MS = 60 * 60 * 1000
const PAST_ROLLFORWARD_MS = 7 * 24 * 60 * 60 * 1000
// Matches the in-game regear verification window — once this has elapsed, the
// battle is considered "ended" for UI sorting purposes. Members can still
// submit regear requests from the site after this; the cutoff is display-only.
const BATTLE_DURATION_MS = 60 * 60 * 1000
// Albion's KR server operates on KST. All event times (display + form input)
// render in KST regardless of the viewer's or server's timezone. KST has no
// DST, so a fixed +9h offset is safe.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

interface KstParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// Extracts KST wall-clock parts from any Date/ISO string. Works by shifting
// into UTC+9 and reading UTC components — correct because KST has no DST.
function toKstParts(iso: string | Date): KstParts {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const shifted = new Date(d.getTime() + KST_OFFSET_MS)
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  }
}

// Builds a UTC Date from KST wall-clock parts. The `+09:00` suffix tells
// the Date constructor to interpret the string as KST, so `.toISOString()`
// on the result yields the correct UTC timestamp for storage.
function kstPartsToDate(p: KstParts): Date {
  return new Date(
    `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}:00+09:00`,
  )
}

export interface ParseGatherTimeOptions {
  // When editing an existing event, pass its stored `gather_at` so the year
  // is preserved. Without this, the past-roll-forward heuristic can silently
  // bump an event's date forward one year on edit (e.g., editing a 3-week-old
  // event to fix notes jumps it to next year).
  referenceIso?: string | null
}

export function parseGatherTime(
  parts: GatherTimeParts,
  options?: ParseGatherTimeOptions,
): Date | null {
  const { month, day, hour, minute } = parts
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  if (!Number.isInteger(day) || day < 1 || day > 31) return null
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null

  const referenceIso = options?.referenceIso ?? null
  const hasReference = Boolean(referenceIso)
  const baseYear = hasReference
    ? toKstParts(referenceIso as string).year
    : toKstParts(new Date()).year
  let dt = kstPartsToDate({ year: baseYear, month, day, hour, minute })
  // Catches impossible combos like 2/30 — JS rolls them to the next month.
  const check = toKstParts(dt)
  if (check.month !== month || check.day !== day) return null
  // Roll-forward heuristic only applies when creating (no reference). On edit
  // we trust the stored year, otherwise stale events silently jump a year
  // whenever the admin re-saves the form.
  if (!hasReference && dt.getTime() < Date.now() - PAST_ROLLFORWARD_MS) {
    dt = kstPartsToDate({ year: baseYear + 1, month, day, hour, minute })
  }
  return dt
}

export function formatGatherTimeKo(iso: string | Date): string {
  const p = toKstParts(iso)
  return `${p.month}월 ${p.day}일 ${pad2(p.hour)}시 ${pad2(p.minute)}분`
}

export function formatGatherTimeJa(iso: string | Date): string {
  const p = toKstParts(iso)
  return `${p.month}月${p.day}日 ${pad2(p.hour)}時${pad2(p.minute)}分`
}

const EN_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

export function formatGatherTimeEn(iso: string | Date): string {
  const p = toKstParts(iso)
  return `${EN_MONTHS[p.month - 1]} ${p.day} ${pad2(p.hour)}:${pad2(p.minute)} KST`
}

// Locale dispatcher for runtime rendering. Use when you have the ISO
// timestamp (Event.gather_at). For legacy rows without gather_at, the
// caller should fall back to Event.gather_time (stored Korean string).
export function formatGatherTimeFor(locale: 'ko' | 'ja' | 'en', iso: string | Date): string {
  if (locale === 'ja') return formatGatherTimeJa(iso)
  if (locale === 'en') return formatGatherTimeEn(iso)
  return formatGatherTimeKo(iso)
}

export function defaultGatherParts(initialIso?: string | null): GatherTimeParts {
  if (initialIso) {
    const p = toKstParts(initialIso)
    return { month: p.month, day: p.day, hour: p.hour, minute: p.minute }
  }
  // Default to the next full hour (KST).
  const p = toKstParts(new Date(Date.now() + 60 * 60 * 1000))
  return { month: p.month, day: p.day, hour: p.hour, minute: 0 }
}

export function isImminent(gatherAt: string | null | undefined): boolean {
  if (!gatherAt) return false
  const diff = Math.abs(new Date(gatherAt).getTime() - Date.now())
  return diff <= IMMINENT_WINDOW_MS
}

export function isEnded(battleStartedAt: string | null | undefined): boolean {
  if (!battleStartedAt) return false
  return new Date(battleStartedAt).getTime() + BATTLE_DURATION_MS < Date.now()
}
