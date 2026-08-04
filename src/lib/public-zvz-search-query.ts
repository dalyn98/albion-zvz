export const PUBLIC_ZVZ_ENTITY_SEARCH_MIN_LENGTH = 2
export const PUBLIC_ZVZ_ENTITY_SEARCH_MAX_LENGTH = 80

export function normalizePublicZvzEntitySearchQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (
    normalized.length < PUBLIC_ZVZ_ENTITY_SEARCH_MIN_LENGTH ||
    normalized.length > PUBLIC_ZVZ_ENTITY_SEARCH_MAX_LENGTH
  ) {
    return null
  }
  return normalized
}
