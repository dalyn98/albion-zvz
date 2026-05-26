import { detectInAppBrowser, detectMobilePlatform } from '@/lib/user-agent'

export const DISCORD_REAUTH_COOKIE_NAME = 'discord_reauth_required'

const DISCORD_REAUTH_MAX_AGE_SECONDS = 60 * 10

export function discordReauthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    maxAge: DISCORD_REAUTH_MAX_AGE_SECONDS,
    path: '/',
  }
}

export function clearDiscordReauthCookieOptions() {
  return {
    ...discordReauthCookieOptions(),
    maxAge: 0,
  }
}

export function shouldUseDiscordConsentPrompt(options: {
  retry: boolean
  invite: string
  reauthCookieValue: string | undefined
  returnTo?: string
  userAgent?: string | null
}): boolean {
  if (options.retry || options.invite.length > 0 || options.reauthCookieValue === '1') {
    return true
  }
  if (!isEventReturnTo(options.returnTo)) return false
  const ua = options.userAgent ?? null
  return detectInAppBrowser(ua) !== null || detectMobilePlatform(ua) !== null
}

function isEventReturnTo(returnTo: string | undefined): boolean {
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) return false
  try {
    const pathname = new URL(returnTo, 'https://albion-guildmanager.local').pathname
    const segments = pathname.split('/').filter(Boolean)
    return segments.length >= 2 && segments[0] === 'events' && segments[1].length > 0
  } catch {
    return false
  }
}
