'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Globe } from 'lucide-react'
import { setLocaleAction } from '@/app/actions/locale'
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/locales'

// 모바일에서는 cycle 버튼 (다음 언어로 한 번에 전환), sm 이상에서는 4개 라벨을
// 펼친 그룹. 헤더 좌우에 다른 컨트롤 (로고, 로그인) 이 동시에 들어가 모바일
// 폭이 부족할 때 4개 인라인 버튼은 줄바꿈/잘림이 발생.
//
// 같은 form action 을 양쪽에 다 두고 Tailwind responsive 로 가시성만 토글 —
// useEffect 기반 viewport detect 는 SSR-CSR mismatch 로 첫 페인트가 깜빡인다.
export default function LanguageSwitcher() {
  const currentLocale = useLocale() as Locale
  const t = useTranslations('sidebar')
  const currentIndex = SUPPORTED_LOCALES.indexOf(currentLocale)
  const nextLocale = SUPPORTED_LOCALES[(currentIndex + 1) % SUPPORTED_LOCALES.length]
  const switchLabel = t('languageSwitchTo', { label: LOCALE_LABELS[nextLocale] })

  return (
    <>
      <form action={setLocaleAction} className="sm:hidden flex justify-center">
        <input type="hidden" name="locale" value={nextLocale} />
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
        className="hidden sm:flex items-center gap-1 px-1"
        role="group"
        aria-label={t('language')}
      >
        <Globe size={13} className="text-gray-500 ml-1 mr-1 flex-shrink-0" />
        {SUPPORTED_LOCALES.map((loc) => (
          <form key={loc} action={setLocaleAction}>
            <input type="hidden" name="locale" value={loc} />
            <button
              type="submit"
              aria-current={currentLocale === loc ? 'true' : undefined}
              className={`text-[11px] px-2 py-1 rounded transition-colors ${
                currentLocale === loc
                  ? 'bg-amber-500/20 text-amber-300 font-semibold'
                  : 'text-gray-500 hover:text-white hover:bg-gray-800'
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
