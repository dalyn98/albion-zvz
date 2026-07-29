// Public guild profiles render this value as an external href. Only accept
// Discord invite hosts and invite-code paths, then emit a canonical HTTPS URL.

const INVITE_CODE_PATTERN = /^[A-Za-z0-9_-]{2,64}$/
const SHORT_INVITE_HOSTS = new Set(['discord.gg', 'www.discord.gg'])
const FULL_INVITE_HOSTS = new Set([
  'discord.com',
  'www.discord.com',
  'discordapp.com',
  'www.discordapp.com',
])

function codeFromSegments(segments: string[], host: string): string | null {
  if (SHORT_INVITE_HOSTS.has(host)) {
    return segments.length === 1 ? segments[0] : null
  }

  if (FULL_INVITE_HOSTS.has(host)) {
    return segments.length === 2 && segments[0].toLowerCase() === 'invite'
      ? segments[1]
      : null
  }

  return null
}

export function getDiscordInviteCode(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase()
  const segments = url.pathname.split('/').filter((segment) => segment.length > 0)
  const code = codeFromSegments(segments, host)
  if (!code || !INVITE_CODE_PATTERN.test(code)) return null

  return code
}

export function toDiscordInviteUrl(raw: string): string | null {
  const code = getDiscordInviteCode(raw)
  return code ? `https://discord.gg/${code}` : null
}
