import { getLocaleCookieDomain } from '@/lib/locale-cookie'

export const LAST_GUILD_COOKIE = 'agm_last_guild'
const LAST_GUILD_MAX_AGE_SECONDS = 60 * 60 * 24 * 180

export function lastGuildCookieOptions(host: string | null | undefined) {
  const domain = getLocaleCookieDomain(host)
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: LAST_GUILD_MAX_AGE_SECONDS,
    ...(domain ? { domain } : {}),
  }
}
