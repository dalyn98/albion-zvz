'use client'

import { useLocale, useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'
import { Globe } from 'lucide-react'
import {
  LOCALE_COOKIE,
  SUPPORTED_LOCALES,
  LOCALE_LABELS,
  type Locale,
} from '@/i18n/locales'
import { replaceSeoMarketingLocale } from '@/lib/seo-locale-paths'

// 마케팅 페이지의 언어별 SEO URL로 이동하는 17개 언어 선택기.
export default function MarketingLanguageSwitcher() {
  const currentLocale = useLocale() as Locale
  const pathname = usePathname()
  const t = useTranslations('sidebar')
  const returnToFor = (locale: Locale): string | null =>
    replaceSeoMarketingLocale(pathname, locale)

  const switchTo = (locale: Locale) => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
    window.location.assign(returnToFor(locale) ?? pathname)
  }

  return (
    <label className="flex items-center gap-1.5 text-gray-400">
      <span className="sr-only">{t('language')}</span>
      <Globe size={15} aria-hidden="true" className="shrink-0" />
      <select
        value={currentLocale}
        onChange={(event) => switchTo(event.target.value as Locale)}
        aria-label={t('language')}
        data-seo-event="language_switch"
        className="min-h-10 max-w-40 rounded-md border border-gray-800 bg-gray-950 px-2 text-xs font-semibold text-gray-300 outline-none transition-colors hover:border-gray-700 hover:text-white focus:border-amber-500/50"
      >
        {SUPPORTED_LOCALES.map((loc) => (
          <option key={loc} value={loc}>{LOCALE_LABELS[loc]}</option>
        ))}
      </select>
    </label>
  )
}
