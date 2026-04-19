import { cookies } from 'next/headers'
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, isLocale } from '@/i18n/locales'

export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  const value = cookieStore.get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : DEFAULT_LOCALE
}
