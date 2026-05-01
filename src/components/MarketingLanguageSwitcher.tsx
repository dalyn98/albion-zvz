'use client'

import { useLocale } from 'next-intl'
import { setLocaleAction } from '@/app/actions/locale'
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/locales'

// 마케팅 페이지 언어 스위처. 마케팅 카피도 ko/ja/en/zh 모두 번역 완료되어
// 사이트 전체와 동일한 언어 셋을 노출한다.
export default function MarketingLanguageSwitcher() {
  const currentLocale = useLocale() as Locale

  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label="Language"
    >
      {SUPPORTED_LOCALES.map((loc) => (
        <form key={loc} action={setLocaleAction}>
          <input type="hidden" name="locale" value={loc} />
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
  )
}
