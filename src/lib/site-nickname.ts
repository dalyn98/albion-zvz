export const SITE_NICKNAME_MAX_LENGTH = 32
export const SITE_NICKNAME_REASON_MAX_LENGTH = 500

const DISCORD_SNOWFLAKE_PATTERN = /^[0-9]{15,25}$/
const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/
const WHITESPACE_PATTERN = /\s+/g

export function normalizeDiscordId(raw: string): string | null {
  const value = raw.trim()
  return DISCORD_SNOWFLAKE_PATTERN.test(value) ? value : null
}

export function normalizeSiteNickname(raw: string): string | null {
  const value = raw.trim().replace(WHITESPACE_PATTERN, ' ')
  if (value.length === 0 || value.length > SITE_NICKNAME_MAX_LENGTH) return null
  if (CONTROL_CHAR_PATTERN.test(value)) return null
  return value
}

export function applySiteNicknameOverride(
  fallbackUsername: string,
  overrideNickname: string | null | undefined,
): string {
  const override = overrideNickname ? normalizeSiteNickname(overrideNickname) : null
  if (override) return override
  return fallbackUsername.trim() || 'Unknown'
}
