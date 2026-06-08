'use client'

import { useLocale, useTranslations } from 'next-intl'
import { usePathname } from 'next/navigation'
import { Globe } from 'lucide-react'
import { setLocaleAction } from '@/app/actions/locale'
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/locales'
import { replaceSeoFeatureLocale } from '@/lib/seo-locale-paths'

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
    replaceSeoFeatureLocale(pathname, locale)

  return (
    <>
      <form action={setLocaleAction} className="sm:hidden">
        <input type="hidden" name="locale" value={nextLocale} />
        {returnToFor(nextLocale) ? (
          <input type="hidden" name="returnTo" value={returnToFor(nextLocale) ?? ''} />
        ) : null}
        <button
          type="submit"
          aria-label={switchLabel}
          title={switchLabel}
          className="p-2 text-gray-400 hover:text-white"
        >
          <Globe size={16} />
        </button>
      </form>

      <div
        className="hidden sm:flex items-center gap-1"
        role="group"
        aria-label={t('language')}
      >
        {SUPPORTED_LOCALES.map((loc) => (
          <form key={loc} action={setLocaleAction}>
            <input type="hidden" name="locale" value={loc} />
            {returnToFor(loc) ? (
              <input type="hidden" name="returnTo" value={returnToFor(loc) ?? ''} />
            ) : null}
            <button
              type="submit"
              aria-current={currentLocale === loc ? 'true' : undefined}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                currentLocale === loc
                  ? 'bg-amber-500/15 text-amber-200 font-semibold'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
              }`}
            >
              {LOCALE_LABELS[loc]}
            </button>
          </form>
        ))}
      </div>
    </>
  )
}
