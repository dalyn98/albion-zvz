import { cookies, headers } from 'next/headers'
import {
  DEFAULT_LOCALE,
  DETECTION_FALLBACK_LOCALE,
  LOCALE_COOKIE,
  type Locale,
  isLocale,
  resolveSupportedLocale,
} from '@/i18n/locales'
import { detectLocaleFromAcceptLanguage } from '@/lib/accept-language'
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

export async function getLocale(): Promise<Locale> {
  const headerStore = await headers()
  const headerLocale = headerStore.get('x-seo-locale')
  if (isLocale(headerLocale)) return headerLocale

  // CDN 캐시가 URL을 키로 쓰는 공개 마케팅 페이지는 cookie/Accept-Language 로
  // 렌더하면 첫 방문자의 언어가 다른 방문자에게 섞인다. 기본 URL은 한국어로
  // 고정하고, 다른 언어는 /{locale}/... URL에서 x-seo-locale로 명시한다.
  if (isCacheableMarketingPathname(headerStore.get('x-pathname'))) {
    return DEFAULT_LOCALE
  }

  const cookieStore = await cookies()
  const value = cookieStore.get(LOCALE_COOKIE)?.value
  const cookieLocale = resolveSupportedLocale(value)
  if (cookieLocale) return cookieLocale
  return detectLocaleFromAcceptLanguage(
    headerStore.get('accept-language'),
    DETECTION_FALLBACK_LOCALE,
  )
}
