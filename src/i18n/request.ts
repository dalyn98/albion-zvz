import { cookies } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from './locales'

export default getRequestConfig(async () => {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(LOCALE_COOKIE)?.value
  const locale = isLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE
  const messages = (await import(`../messages/${locale}.json`)).default
  return { locale, messages }
})
