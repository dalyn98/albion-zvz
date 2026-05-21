import { cookies, headers } from 'next/headers'
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, isLocale } from '@/i18n/locales'
import { detectLocaleFromAcceptLanguage } from '@/lib/accept-language'

export async function getLocale(): Promise<Locale> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  const value = cookieStore.get(LOCALE_COOKIE)?.value
  if (isLocale(value)) return value
  return detectLocaleFromAcceptLanguage(headerStore.get('accept-language'), DEFAULT_LOCALE)
}
