export const SUPPORTED_LOCALES = ['ko', 'ja', 'en', 'zh'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'ko'

export const LOCALE_COOKIE = 'lang'

export function isLocale(value: string | undefined | null): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export const LOCALE_LABELS: Record<Locale, string> = {
  ko: '한국어',
  ja: '日本語',
  en: 'English',
  zh: '中文',
}
