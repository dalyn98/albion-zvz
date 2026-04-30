// Tenant timezone configuration. Each guild picks one IANA timezone — display
// helpers and day-boundary stats both read this. Presets cover Albion's four
// real-world server regions; the IANA strings are the standard zones for those
// regions, including DST handling where applicable (only Asia/Seoul has no DST).

export interface TenantTimezoneOption {
  id: 'kr' | 'eu' | 'na' | 'sa'
  iana: string
}

export const TENANT_TIMEZONE_OPTIONS: readonly TenantTimezoneOption[] = [
  { id: 'kr', iana: 'Asia/Seoul' },
  { id: 'eu', iana: 'Europe/Berlin' },
  { id: 'na', iana: 'America/New_York' },
  { id: 'sa', iana: 'America/Sao_Paulo' },
] as const

export const DEFAULT_TENANT_TIMEZONE = 'Asia/Seoul'

// Returns true iff `iana` is one of the four presets. Validation gate so an
// admin (or migration) can't write `Pluto/Mars` and crash the formatters.
export function isValidTenantTimezone(iana: string): boolean {
  return TENANT_TIMEZONE_OPTIONS.some((o) => o.iana === iana)
}

interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

// IANA-aware extraction of wall-clock parts from any UTC instant. Uses
// Intl.DateTimeFormat — handles DST transitions correctly for Europe/America zones.
export function toZonedParts(input: string | Date | number, tz: string): ZonedParts {
  const date = typeof input === 'string' || typeof input === 'number' ? new Date(input) : input
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const get = (type: string): number => {
    const found = parts.find((p) => p.type === type)
    return found ? Number(found.value) : 0
  }
  // Some impls return hour=24 for midnight; normalize.
  let hour = get('hour')
  if (hour === 24) hour = 0
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  }
}

// Inverse of toZonedParts: given wall-clock parts in a target timezone, return
// the UTC instant. Iterates once to converge across DST transitions — for the
// 1h "spring forward" gap or "fall back" overlap we deterministically pick the
// later/standard time, since users typing event times don't care about ambiguity.
export function zonedPartsToUtc(
  parts: { year: number; month: number; day: number; hour: number; minute: number },
  tz: string,
): Date {
  // First guess: treat the parts as UTC. The offset of *that* UTC moment in tz
  // is approximately what we need — for non-DST and stable periods, it's exact.
  const guessUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    0,
  )
  const seenInTz = toZonedParts(guessUtc, tz)
  // Compute the difference between the guess (interpreted as UTC) and what the
  // tz reports for that same UTC instant. The diff is the offset of that moment
  // in the target tz; subtract it to land at the correct UTC.
  const seenAsUtc = Date.UTC(
    seenInTz.year,
    seenInTz.month - 1,
    seenInTz.day,
    seenInTz.hour,
    seenInTz.minute,
    seenInTz.second,
  )
  const offsetMs = seenAsUtc - guessUtc
  return new Date(guessUtc - offsetMs)
}

// `getTenantTimezone` lives in `@/lib/timezone-server` so the lazy `app-settings`
// import (which transitively pulls `next/headers` via super-admin impersonation)
// cannot leak into client bundles. Turbopack still tracks `await import()` as a
// static dep, so we keep this module pure and import the async fetcher
// explicitly from server code.

// Returns YYYY-MM-DD as observed in `tz`. Used by streak and finance day-key
// computations — replaces the old `seoulDateKey` hardcoded helper.
export function tenantDateKey(input: string | Date | number, tz: string): string {
  const p = toZonedParts(input, tz)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

// 통계/대시보드 위젯의 "이번 주" 경계. 미국 태평양 시간(America/Los_Angeles) 기준
// 가장 최근 월요일 00:00 의 UTC 인스턴트 ISO 문자열을 돌려준다. 길드별 timezone
// 과 무관하게 사이트 전역에서 동일한 주 경계를 쓰기 위함 — 길드원 분포가 NA/EU/KR
// 로 흩어져 있어도 모두 같은 "이번 주" 데이터를 본다 (Discord 길드 운영팀의
// 일반적 관행).
//
// DST 처리: zonedPartsToUtc 가 LA 의 DST 전환을 자동 보정한다. 봄 forward 직후
// 첫 일요일 → 월요일 자정 경계도 정확히 잡힌다.
const WEEKLY_TZ = 'America/Los_Angeles'

export function getCurrentWeekStartIso(now: Date = new Date()): string {
  const parts = toZonedParts(now, WEEKLY_TZ)
  // year/month/day 자체를 UTC 의 같은 날짜로 본 뒤 getUTCDay() 로 해당 LA 캘린더
  // 일자의 요일을 얻는다 (시각 무관). 0=Sun … 6=Sat → daysSinceMonday 계산.
  const synthetic = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  const dow = synthetic.getUTCDay()
  const daysSinceMonday = (dow + 6) % 7
  synthetic.setUTCDate(synthetic.getUTCDate() - daysSinceMonday)
  return zonedPartsToUtc(
    {
      year: synthetic.getUTCFullYear(),
      month: synthetic.getUTCMonth() + 1,
      day: synthetic.getUTCDate(),
      hour: 0,
      minute: 0,
    },
    WEEKLY_TZ,
  ).toISOString()
}

// "UTC+9", "UTC-5", "UTC+5:30" 형태의 라벨 반환. 시간대 선택 UI 에 노출해
// 사용자가 자기 지역과 시차를 즉시 인지할 수 있도록 한다. DST 가 적용되는
// EU/NA/SA 는 현재 시각(when) 기준으로 동적으로 계산되므로, 6개월 후엔 1시간
// 차이가 나게 표시된다 — 이게 의도된 동작.
export function getUtcOffsetLabel(tz: string, when: Date = new Date()): string {
  const parts = toZonedParts(when, tz)
  const tzAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  const diffMin = Math.round((tzAsUtcMs - when.getTime()) / 60000)
  const sign = diffMin >= 0 ? '+' : '-'
  const abs = Math.abs(diffMin)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, '0')}`
}
