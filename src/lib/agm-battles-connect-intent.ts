import { getLocaleCookieDomain } from '@/lib/locale-cookie'

export const AGM_BATTLES_CONNECT_INTENT_COOKIE = 'agm_battles_connect_intent'
export const AGM_BATTLES_CONNECT_INTENT_MAX_AGE_SECONDS = 60 * 60 * 24

export function agmBattlesConnectIntentCookieOptions(
  host: string | null | undefined,
) {
  const domain = getLocaleCookieDomain(host)
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: AGM_BATTLES_CONNECT_INTENT_MAX_AGE_SECONDS,
    priority: 'low' as const,
    ...(domain ? { domain } : {}),
  }
}

export function expiredAgmBattlesConnectIntentCookieOptions(
  host: string | null | undefined,
) {
  return { ...agmBattlesConnectIntentCookieOptions(host), maxAge: 0 }
}
