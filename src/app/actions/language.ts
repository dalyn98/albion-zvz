'use server'


import { publicActionError, publicActionMessage } from '@/lib/public-action-error'
import { cookies, headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { getAdminClient } from '@/lib/supabase-admin'
import { LOCALE_COOKIE, isLocale, type Locale } from '@/i18n/locales'
import { localeCookieOptions } from '@/lib/locale-cookie'

// 세션 사용자의 preferred_language 조회. guild_avatars 먼저, 없으면 guests.
// null 반환은 "아직 선택 안함" — 환영 페이지로 유도하는 시그널.
//
// (guild_id, discord_id) 두 컬럼을 모두 필터해야 한다 — 한 디스코드 계정이
// 여러 테넌트 소속일 때 다른 길드 row 가 반환되는 cross-tenant 누설을 막는다.
export async function getMyPreferredLanguage(): Promise<{
  locale: Locale | null
  error?: string
}> {
  const session = await getSession()
  if (!session) return { locale: null, error: await publicActionMessage('unauthorized') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const table = session.isGuest ? 'guests' : 'guild_avatars'
  const { data, error } = await db
    .from(table)
    .select('preferred_language')
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
    .maybeSingle()
  if (error) return { locale: null, error: await publicActionError(error, 'actions/language') }
  const raw = data?.preferred_language ?? null
  return { locale: isLocale(raw) ? raw : null }
}

// DB 에 저장하고 lang 쿠키도 즉시 동기화 — 쿠키가 next-intl 의 1차 소스라
// 한쪽만 업데이트하면 다음 요청에서 이전 언어로 렌더된다.
//
// guild_id 필터 누락 시 같은 discord_id 의 다른 테넌트 row 까지 일괄 갱신되는
// cross-tenant write leak 발생. 두 컬럼 모두 명시.
export async function setMyPreferredLanguage(
  locale: Locale,
): Promise<{ error?: string }> {
  if (!isLocale(locale)) return { error: 'invalid_locale' }

  const session = await getSession()
  if (!session) return { error: await publicActionMessage('unauthorized') }
  const guildId = await getSessionGuildId(session)

  const db = getAdminClient()
  const table = session.isGuest ? 'guests' : 'guild_avatars'
  const { error } = await db
    .from(table)
    .update({ preferred_language: locale })
    .eq('guild_id', guildId)
    .eq('discord_id', session.discordId)
  if (error) return { error: await publicActionError(error, 'actions/language') }

  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  cookieStore.set(LOCALE_COOKIE, locale, localeCookieOptions(headerStore.get('host')))
  revalidatePath('/', 'layout')
  return {}
}
