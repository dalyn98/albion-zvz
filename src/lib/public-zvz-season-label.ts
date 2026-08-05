const SEASON_NUMBER_PATTERNS = [
  /\bseason\s*#?\s*(\d{1,4})\b/i,
  /시즌\s*#?\s*(\d{1,4})/u,
] as const

export function extractPublicZvzSeasonNumber(name: string): number | null {
  const normalized = name.trim()
  for (const pattern of SEASON_NUMBER_PATTERNS) {
    const match = pattern.exec(normalized)
    if (!match?.[1]) continue
    const season = Number(match[1])
    if (Number.isSafeInteger(season) && season > 0) return season
  }
  return null
}
