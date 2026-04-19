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

export function parseGatherTime(parts: GatherTimeParts): Date | null {
  const { month, day, hour, minute } = parts
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  if (!Number.isInteger(day) || day < 1 || day > 31) return null
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null

  const now = new Date()
  let dt = new Date(now.getFullYear(), month - 1, day, hour, minute, 0, 0)
  // Catches impossible combos like 2/30 — JS rolls them to the next month.
  if (dt.getMonth() !== month - 1 || dt.getDate() !== day) return null
  // If the caller entered a date that's clearly in the past (more than a week),
  // assume they meant next year — e.g., entering "1월 5일" in December.
  if (dt.getTime() < now.getTime() - PAST_ROLLFORWARD_MS) {
    dt = new Date(now.getFullYear() + 1, month - 1, day, hour, minute, 0, 0)
  }
  return dt
}

export function formatGatherTimeKo(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}시 ${String(d.getMinutes()).padStart(2, '0')}분`
}

export function formatGatherTimeJa(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}時${String(d.getMinutes()).padStart(2, '0')}分`
}

const EN_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

export function formatGatherTimeEn(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  return `${EN_MONTHS[d.getMonth()]} ${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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
    const d = new Date(initialIso)
    return {
      month: d.getMonth() + 1,
      day: d.getDate(),
      hour: d.getHours(),
      minute: d.getMinutes(),
    }
  }
  // Default to the next full hour today.
  const now = new Date()
  const next = new Date(now.getTime() + 60 * 60 * 1000)
  return {
    month: next.getMonth() + 1,
    day: next.getDate(),
    hour: next.getHours(),
    minute: 0,
  }
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
