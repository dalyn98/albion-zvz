'use client'

import { useLocale } from 'next-intl'
import { setLocaleAction } from '@/app/actions/locale'
import { LOCALE_LABELS, type Locale } from '@/i18n/locales'

// 마케팅 페이지 전용 언어 스위처. 앱 전체는 ko/ja/en 을 지원하지만 마케팅
// 카피는 우선 ko/en 만 작성한다. 추후 ja 카피가 준비되면 이 배열에 'ja' 를
// 추가하면 자동으로 노출된다 — 새 언어 추가 시 i18n 메시지 키만 채우면 된다.
const MARKETING_LOCALES: ReadonlyArray<Locale> = ['ko', 'en']

export default function MarketingLanguageSwitcher() {
  const currentLocale = useLocale() as Locale

  return (
    <div
      className="flex items-center gap-1"
      role="group"
      aria-label="Language"
    >
      {MARKETING_LOCALES.map((loc) => (
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
