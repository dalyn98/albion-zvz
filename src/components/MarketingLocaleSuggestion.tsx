'use client'

import { useEffect } from 'react'
import { useLocale } from 'next-intl'
import { usePathname } from 'next/navigation'
import {
  DETECTION_FALLBACK_LOCALE,
  LOCALE_COOKIE,
  resolveSupportedLocale,
  type Locale,
} from '@/i18n/locales'
import {
  getSeoMarketingLocale,
  replaceSeoMarketingLocale,
} from '@/lib/seo-locale-paths'

function cookieLocale(): Locale | null {
  const raw = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1)
  return resolveSupportedLocale(raw ? decodeURIComponent(raw) : null)
}

function browserLocale(): Locale | null {
  for (const language of navigator.languages ?? [navigator.language]) {
    const locale = resolveSupportedLocale(language)
    if (locale) return locale
  }
  return DETECTION_FALLBACK_LOCALE
}

export default function MarketingLocaleSuggestion() {
  const currentLocale = useLocale() as Locale
  const pathname = usePathname()

  useEffect(() => {
    if (getSeoMarketingLocale(pathname)) return
    const targetLocale = cookieLocale() ?? browserLocale()
    if (!targetLocale || targetLocale === currentLocale) return

    const href = replaceSeoMarketingLocale(pathname, targetLocale)
    if (!href) return

    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${LOCALE_COOKIE}=${targetLocale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
    window.location.replace(`${href}${window.location.search}${window.location.hash}`)
  }, [currentLocale, pathname])

  return null
}
