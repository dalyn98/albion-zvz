'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'
import { getAdminClient } from '@/lib/supabase-admin'
import { LOCALE_COOKIE, isLocale, type Locale } from '@/i18n/locales'

// 쿠키 만료 1년 — /app/actions/locale.ts 의 setLocaleAction 과 동일.
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

// 세션 사용자의 preferred_language 조회. guild_avatars 먼저, 없으면 guests.
// null 반환은 "아직 선택 안함" — 환영 페이지로 유도하는 시그널.
export async function getMyPreferredLanguage(): Promise<{
  locale: Locale | null
  error?: string
}> {
  const session = await getSession()
  if (!session) return { locale: null, error: 'Unauthorized' }

  const db = getAdminClient()
  const table = session.isGuest ? 'guests' : 'guild_avatars'
  const { data, error } = await db
    .from(table)
    .select('preferred_language')
    .eq('discord_id', session.discordId)
    .maybeSingle()
  if (error) return { locale: null, error: error.message }
  const raw = data?.preferred_language ?? null
  return { locale: isLocale(raw) ? raw : null }
}

// DB 에 저장하고 lang 쿠키도 즉시 동기화 — 쿠키가 next-intl 의 1차 소스라
// 한쪽만 업데이트하면 다음 요청에서 이전 언어로 렌더된다.
export async function setMyPreferredLanguage(
  locale: Locale,
): Promise<{ error?: string }> {
  if (!isLocale(locale)) return { error: 'invalid_locale' }

  const session = await getSession()
  if (!session) return { error: 'Unauthorized' }

  const db = getAdminClient()
  const table = session.isGuest ? 'guests' : 'guild_avatars'
  const { error } = await db
    .from(table)
    .update({ preferred_language: locale })
    .eq('discord_id', session.discordId)
  if (error) return { error: error.message }

  const cookieStore = await cookies()
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
  })
  revalidatePath('/', 'layout')
  return {}
}
