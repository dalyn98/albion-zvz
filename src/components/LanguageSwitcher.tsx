'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Globe } from 'lucide-react'
import { setLocaleAction } from '@/app/actions/locale'
import { SUPPORTED_LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/locales'

interface LanguageSwitcherProps {
  expanded: boolean
}

export default function LanguageSwitcher({ expanded }: LanguageSwitcherProps) {
  const currentLocale = useLocale() as Locale
  const t = useTranslations('sidebar')

  if (!expanded) {
    // Collapsed: cycle to the next locale on click.
    const currentIndex = SUPPORTED_LOCALES.indexOf(currentLocale)
    const nextLocale = SUPPORTED_LOCALES[(currentIndex + 1) % SUPPORTED_LOCALES.length]
    return (
      <form action={setLocaleAction} className="flex justify-center">
        <input type="hidden" name="locale" value={nextLocale} />
        <button
          type="submit"
          aria-label={t('languageSwitchTo', { label: LOCALE_LABELS[nextLocale] })}
          title={t('languageSwitchTo', { label: LOCALE_LABELS[nextLocale] })}
          className="p-2 text-gray-400 hover:text-white"
        >
          <Globe size={16} />
        </button>
      </form>
    )
  }

  return (
    <div
      className="flex items-center gap-1 px-1"
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
  )
}
