import { DEFAULT_TENANT_TIMEZONE, toZonedParts, zonedPartsToUtc } from '@/lib/timezone'
import { getIntlLocale, type Locale } from '@/i18n/locales'
import { isOperationallyEnded } from '@/lib/event-operational-state'

export interface GatherTimeParts {
  month: number
  day: number
  hour: number
  minute: number
}

const IMMINENT_WINDOW_MS = 60 * 60 * 1000
const PAST_ROLLFORWARD_MS = 7 * 24 * 60 * 60 * 1000
function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export interface ParseGatherTimeOptions {
  // When editing an existing event, pass its stored `gather_at` so the year
  // is preserved. Without this, the past-roll-forward heuristic can silently
  // bump an event's date forward one year on edit (e.g., editing a 3-week-old
  // event to fix notes jumps it to next year).
  referenceIso?: string | null
  // Tenant timezone. Defaults to Asia/Seoul to match legacy behaviour for
  // tenants that haven't picked a timezone yet (existing menhera install).
  timezone?: string
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

  const tz = options?.timezone ?? DEFAULT_TENANT_TIMEZONE
  const referenceIso = options?.referenceIso ?? null
  const hasReference = Boolean(referenceIso)
  const baseYear = hasReference
    ? toZonedParts(referenceIso as string, tz).year
    : toZonedParts(new Date(), tz).year
  let dt = zonedPartsToUtc({ year: baseYear, month, day, hour, minute }, tz)
  // Catches impossible combos like 2/30 — the wall-clock parts roll into the
  // next month when re-projected through the timezone.
  const check = toZonedParts(dt, tz)
  if (check.month !== month || check.day !== day) return null
  // Roll-forward heuristic only applies when creating (no reference). On edit
  // we trust the stored year, otherwise stale events silently jump a year
  // whenever the admin re-saves the form.
  if (!hasReference && dt.getTime() < Date.now() - PAST_ROLLFORWARD_MS) {
    dt = zonedPartsToUtc({ year: baseYear + 1, month, day, hour, minute }, tz)
  }
  return dt
}

export function formatGatherTimeKo(iso: string | Date, tz: string = DEFAULT_TENANT_TIMEZONE): string {
  const p = toZonedParts(iso, tz)
  return `${p.month}월 ${p.day}일 ${pad2(p.hour)}시 ${pad2(p.minute)}분`
}

export function formatGatherTimeJa(iso: string | Date, tz: string = DEFAULT_TENANT_TIMEZONE): string {
  const p = toZonedParts(iso, tz)
  return `${p.month}月${p.day}日 ${pad2(p.hour)}時${pad2(p.minute)}分`
}

const EN_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

const TZ_LABEL_EN: Record<string, string> = {
  'Asia/Seoul': 'KST',
  'Europe/Berlin': 'CET',
  'America/New_York': 'ET',
  'America/Sao_Paulo': 'BRT',
}

export function formatGatherTimeEn(iso: string | Date, tz: string = DEFAULT_TENANT_TIMEZONE): string {
  const p = toZonedParts(iso, tz)
  const label = TZ_LABEL_EN[tz] ?? tz
  return `${EN_MONTHS[p.month - 1]} ${p.day} ${pad2(p.hour)}:${pad2(p.minute)} ${label}`
}

export function formatGatherTimeZh(iso: string | Date, tz: string = DEFAULT_TENANT_TIMEZONE): string {
  const p = toZonedParts(iso, tz)
  return `${p.month}月${p.day}日 ${pad2(p.hour)}时${pad2(p.minute)}分`
}

function formatGatherTimeIntl(
  locale: Locale,
  iso: string | Date,
  tz: string,
): string {
  return new Intl.DateTimeFormat(getIntlLocale(locale), {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz,
    timeZoneName: 'short',
  }).format(typeof iso === 'string' ? new Date(iso) : iso)
}

// Locale dispatcher for runtime rendering. Use when you have the ISO
// timestamp (Event.gather_at). For legacy rows without gather_at, the
// caller should fall back to Event.gather_time (stored Korean string).
export function formatGatherTimeFor(
  locale: Locale,
  iso: string | Date,
  tz: string = DEFAULT_TENANT_TIMEZONE,
): string {
  if (locale === 'ja') return formatGatherTimeJa(iso, tz)
  if (locale === 'en') return formatGatherTimeEn(iso, tz)
  if (locale === 'zh') return formatGatherTimeZh(iso, tz)
  if (locale === 'ko') return formatGatherTimeKo(iso, tz)
  return formatGatherTimeIntl(locale, iso, tz)
}

export function defaultGatherParts(
  initialIso?: string | null,
  tz: string = DEFAULT_TENANT_TIMEZONE,
): GatherTimeParts {
  if (initialIso) {
    const p = toZonedParts(initialIso, tz)
    return { month: p.month, day: p.day, hour: p.hour, minute: p.minute }
  }
  // Default to the next full hour in the tenant's timezone.
  const p = toZonedParts(new Date(Date.now() + 60 * 60 * 1000), tz)
  return { month: p.month, day: p.day, hour: p.hour, minute: 0 }
}

export function isImminent(gatherAt: string | null | undefined): boolean {
  if (!gatherAt) return false
  const diff = Math.abs(new Date(gatherAt).getTime() - Date.now())
  return diff <= IMMINENT_WINDOW_MS
}

export function isEnded(
  battleStartedAt: string | null | undefined,
  operationalEndedAt?: string | null,
): boolean {
  return isOperationallyEnded({
    battle_started_at: battleStartedAt,
    operational_ended_at: operationalEndedAt,
  })
}
