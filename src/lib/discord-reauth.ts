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
}): boolean {
  return options.retry || options.invite.length > 0 || options.reauthCookieValue === '1'
}
