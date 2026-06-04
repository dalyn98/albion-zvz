const DISCORD_ID_PATTERN = /^\d{5,30}$/
const MAX_DISCORD_ID_LIST_LENGTH = 250

export function isDiscordId(value: unknown): value is string {
  return typeof value === 'string' && DISCORD_ID_PATTERN.test(value)
}

export function normalizeDiscordIdList(values: readonly unknown[]): string[] | null {
  if (values.length > MAX_DISCORD_ID_LIST_LENGTH) return null
  const clean: string[] = []
  for (const value of values) {
    if (typeof value !== 'string' || !isDiscordId(value)) return null
    if (!clean.includes(value)) clean.push(value)
  }
  return clean
}
