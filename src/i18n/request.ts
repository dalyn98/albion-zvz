import { cookies, headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'
import {
  DEFAULT_LOCALE,
  DETECTION_FALLBACK_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  resolveSupportedLocale,
} from './locales'
import { detectLocaleFromAcceptLanguage } from '@/lib/accept-language'
import { DEFAULT_TENANT_TIMEZONE } from '@/lib/timezone'
import {
  getSeoDocsCanonicalPathname,
  getSeoFeatureCanonicalPathname,
  getSeoMarketingCanonicalPathname,
} from '@/lib/seo-locale-paths'

function isCacheableMarketingPathname(pathname: string | null): boolean {
  if (!pathname) return false
  return Boolean(
    getSeoMarketingCanonicalPathname(pathname) ||
      getSeoFeatureCanonicalPathname(pathname) ||
      getSeoDocsCanonicalPathname(pathname),
  )
}

export default getRequestConfig(async ({ locale: localeOverride }) => {
  if (isLocale(localeOverride)) {
    const messages = (await import(`../messages/${localeOverride}.json`)).default
    return { locale: localeOverride, messages, timeZone: DEFAULT_TENANT_TIMEZONE }
  }

  const headerStore = await headers()
  const headerLocale = headerStore.get('x-seo-locale')
  let locale = isLocale(headerLocale) ? headerLocale : null
  if (!locale && isCacheableMarketingPathname(headerStore.get('x-pathname'))) {
    locale = DEFAULT_LOCALE
  }
  if (!locale) {
    const cookieValue = (await cookies()).get(LOCALE_COOKIE)?.value
    locale = resolveSupportedLocale(cookieValue) ?? detectLocaleFromAcceptLanguage(
      headerStore.get('accept-language'),
      DETECTION_FALLBACK_LOCALE,
    )
  }
  const messages = (await import(`../messages/${locale}.json`)).default
  return { locale, messages, timeZone: DEFAULT_TENANT_TIMEZONE }
})
