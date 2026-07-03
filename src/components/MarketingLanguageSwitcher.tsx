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

// 마케팅 페이지 언어 스위처. 마케팅 카피도 ko/ja/en/zh 모두 번역 완료되어
// 사이트 전체와 동일한 언어 셋을 노출한다. 모바일에서는 cycle 버튼,
// sm 이상에서는 인라인 4개 라벨 — 헤더에 로고/홈/문서/로그인이 같이 들어가
// 모바일 폭 부족 시 줄바꿈/잘림을 막기 위함.
export default function MarketingLanguageSwitcher() {
  const currentLocale = useLocale() as Locale
  const pathname = usePathname()
  const t = useTranslations('sidebar')
  const currentIndex = SUPPORTED_LOCALES.indexOf(currentLocale)
  const nextLocale = SUPPORTED_LOCALES[(currentIndex + 1) % SUPPORTED_LOCALES.length]
  const switchLabel = t('languageSwitchTo', { label: LOCALE_LABELS[nextLocale] })
  const returnToFor = (locale: Locale): string | null =>
    replaceSeoMarketingLocale(pathname, locale)

  const switchTo = (locale: Locale) => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${LOCALE_COOKIE}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
    window.location.assign(returnToFor(locale) ?? pathname)
  }

  return (
    <>
      <div className="sm:hidden">
        <button
          type="button"
          onClick={() => switchTo(nextLocale)}
          aria-label={switchLabel}
          title={switchLabel}
          data-seo-event="language_switch"
          data-seo-target={nextLocale}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-800/60 hover:text-white"
        >
          <Globe size={16} />
        </button>
      </div>

      <div
        className="hidden sm:flex items-center gap-1"
        role="group"
        aria-label={t('language')}
      >
        {SUPPORTED_LOCALES.map((loc) => (
          <div key={loc}>
            <button
              type="button"
              onClick={() => switchTo(loc)}
              aria-current={currentLocale === loc ? 'true' : undefined}
              data-seo-event="language_switch"
              data-seo-target={loc}
              className={`min-h-10 rounded-md px-3 text-xs transition-colors ${
                currentLocale === loc
                  ? 'bg-amber-500/15 text-amber-200 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
              }`}
            >
              {LOCALE_LABELS[loc]}
            </button>
          </div>
        ))}
      </div>
    </>
  )
}
