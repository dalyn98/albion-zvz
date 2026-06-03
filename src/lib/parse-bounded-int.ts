export function parseBoundedInt(
  raw: string | null | undefined,
  min: number,
  max: number,
): number | null {
  const trimmed = raw?.trim()
  if (!trimmed || !/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed)) return null
  return Math.min(Math.max(parsed, min), max)
}

export function parsePositiveSafeInt(raw: string | null | undefined): number | null {
  const trimmed = raw?.trim()
  if (!trimmed || !/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}
