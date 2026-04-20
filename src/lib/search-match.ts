// Shared list-filter helpers. Searches are loose on purpose — admins type
// partial names ("부보") or dates in many formats ("4/19", "04-19", "0419",
// "2026-04-19"). Normalizing both sides makes all of those match.

export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s]+/g, '')
}

export function matchesName(name: string | null | undefined, query: string): boolean {
  if (!query) return true
  if (!name) return false
  return normalizeQuery(name).includes(query)
}

// Matches an ISO timestamp against a date-ish query. We serialize the date as
// multiple string shapes so typing any part of the date hits. Cheap enough to
// do per-row at guild scale. Date components are extracted in KST so search
// matches what the user sees — e.g. typing "4/20" finds an event labeled
// "4월 20일" even if the viewer is in another timezone.
export function matchesDate(iso: string | null | undefined, query: string): boolean {
  if (!query) return true
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const shifted = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const yyyy = String(shifted.getUTCFullYear())
  const month = shifted.getUTCMonth() + 1
  const day = shifted.getUTCDate()
  const mm = String(month).padStart(2, '0')
  const dd = String(day).padStart(2, '0')
  const candidates = [
    `${yyyy}-${mm}-${dd}`,
    `${yyyy}/${mm}/${dd}`,
    `${mm}-${dd}`,
    `${mm}/${dd}`,
    `${mm}${dd}`,
    `${yyyy}${mm}${dd}`,
    `${month}월${day}일`,
  ].map(normalizeQuery)
  return candidates.some((c) => c.includes(query))
}
