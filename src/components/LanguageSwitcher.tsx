'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Globe } from 'lucide-react'
import { setLocaleAction } from '@/app/actions/locale'
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/locales'

// 17개 언어를 헤더 폭 안에서 안정적으로 제공하기 위해 native select를 사용한다.
// JS가 꺼져도 현재 값과 옵션은 읽을 수 있고, 변경 시 기존 Server Action으로
// 쿠키를 갱신해 동일한 페이지를 다시 렌더한다.
export default function LanguageSwitcher() {
  const currentLocale = useLocale() as Locale
  const t = useTranslations('sidebar')

  return (
    <form action={setLocaleAction} className="flex items-center gap-1.5">
      <Globe size={14} aria-hidden="true" className="shrink-0 text-gray-500" />
      <label htmlFor="app-language" className="sr-only">
        {t('language')}
      </label>
      <select
        id="app-language"
        name="locale"
        value={currentLocale}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        aria-label={t('language')}
        className="min-h-10 min-w-10 max-w-40 rounded-lg border border-gray-800 bg-gray-950 px-2 text-xs font-semibold text-gray-300 outline-none transition-colors hover:border-gray-700 hover:text-white focus:border-amber-500/50"
      >
        {SUPPORTED_LOCALES.map((locale) => (
          <option key={locale} value={locale}>
            {LOCALE_LABELS[locale]}
          </option>
        ))}
      </select>
    </form>
  )
}
