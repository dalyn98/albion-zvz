import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from './locales'
import { detectLocaleFromAcceptLanguage } from '@/lib/accept-language'

export default getRequestConfig(async () => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value
  const locale = isLocale(cookieValue)
    ? cookieValue
    : detectLocaleFromAcceptLanguage(headerStore.get('accept-language'), DEFAULT_LOCALE)
  const messages = (await import(`../messages/${locale}.json`)).default
  return { locale, messages }
})
