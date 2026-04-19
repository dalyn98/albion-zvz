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
// do per-row at guild scale.
export function matchesDate(iso: string | null | undefined, query: string): boolean {
  if (!query) return true
  if (!iso) return false
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return false
  const yyyy = String(d.getFullYear())
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const candidates = [
    `${yyyy}-${mm}-${dd}`,
    `${yyyy}/${mm}/${dd}`,
    `${mm}-${dd}`,
    `${mm}/${dd}`,
    `${mm}${dd}`,
    `${yyyy}${mm}${dd}`,
    `${d.getMonth() + 1}월${d.getDate()}일`,
  ].map(normalizeQuery)
  return candidates.some((c) => c.includes(query))
}
