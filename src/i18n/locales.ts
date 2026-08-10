export const SUPPORTED_LOCALES = [
  'ko',
  'ja',
  'en',
  'zh',
  'zh-Hant',
  'fr',
  'de',
  'es-ES',
  'es-419',
  'pt-BR',
  'pt-PT',
  'pl',
  'ru',
  'it',
  'id',
  'ar',
  'tr',
] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'ko'

// 공개 기본 URL은 기존 한국어 canonical을 유지하지만, 브라우저 언어가
// 지원되지 않는 신규 방문자에게는 가장 보편적인 영어를 사용한다.
export const DETECTION_FALLBACK_LOCALE: Locale = 'en'

export const LOCALE_COOKIE = 'lang'

export function isLocale(value: string | undefined | null): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

export const LOCALE_LABELS: Record<Locale, string> = {
  ko: '한국어',
  ja: '日本語',
  en: 'English',
  zh: '简体中文',
  'zh-Hant': '繁體中文',
  fr: 'Français',
  de: 'Deutsch',
  'es-ES': 'Español (España)',
  'es-419': 'Español (Latinoamérica)',
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  pl: 'Polski',
  ru: 'Русский',
  it: 'Italiano',
  id: 'Bahasa Indonesia',
  ar: 'العربية',
  tr: 'Türkçe',
}

export const LOCALE_INTL_TAGS: Record<Locale, string> = {
  ko: 'ko-KR',
  ja: 'ja-JP',
  en: 'en-US',
  zh: 'zh-Hans',
  'zh-Hant': 'zh-Hant',
  fr: 'fr-FR',
  de: 'de-DE',
  'es-ES': 'es-ES',
  'es-419': 'es-419',
  'pt-BR': 'pt-BR',
  'pt-PT': 'pt-PT',
  pl: 'pl-PL',
  ru: 'ru-RU',
  it: 'it-IT',
  id: 'id-ID',
  ar: 'ar',
  tr: 'tr-TR',
}

export const LOCALE_HREFLANG_TAGS: Record<Locale, string> = {
  ko: 'ko',
  ja: 'ja',
  en: 'en',
  zh: 'zh-Hans',
  'zh-Hant': 'zh-Hant',
  fr: 'fr',
  de: 'de',
  'es-ES': 'es-ES',
  // Google hreflang은 es-419를 지원하지 않아 중남미 공통 스페인어는 es를 쓴다.
  'es-419': 'es',
  'pt-BR': 'pt-BR',
  'pt-PT': 'pt-PT',
  pl: 'pl',
  ru: 'ru',
  it: 'it',
  id: 'id',
  ar: 'ar',
  tr: 'tr',
}

export type LocaleDirection = 'ltr' | 'rtl'

export function getLocaleDirection(locale: Locale): LocaleDirection {
  return locale === 'ar' ? 'rtl' : 'ltr'
}

export function getIntlLocale(locale: Locale): string {
  return LOCALE_INTL_TAGS[locale]
}

export function getHreflangLocale(locale: Locale): string {
  return LOCALE_HREFLANG_TAGS[locale]
}

/**
 * Browser/Discord BCP 47 태그를 제품의 canonical locale로 정규화한다.
 * 중국어 문자체계와 스페인어·포르투갈어 지역 변형은 base language보다 먼저 판정한다.
 */
export function resolveSupportedLocale(value: string | undefined | null): Locale | null {
  if (!value) return null
  const normalized = value.trim().replaceAll('_', '-').toLowerCase()
  if (!normalized || normalized === '*') return null

  if (/^zh-(tw|hk|mo|hant)(-|$)/.test(normalized)) return 'zh-Hant'
  if (normalized === 'zh-hant') return 'zh-Hant'
  if (normalized === 'zh' || /^zh-(cn|sg|hans)(-|$)/.test(normalized)) return 'zh'

  if (normalized === 'es-es' || normalized.startsWith('es-es-')) return 'es-ES'
  if (normalized === 'es' || normalized.startsWith('es-')) return 'es-419'

  if (normalized === 'pt-pt' || normalized.startsWith('pt-pt-')) return 'pt-PT'
  if (normalized === 'pt' || normalized.startsWith('pt-')) return 'pt-BR'

  const exact = SUPPORTED_LOCALES.find((locale) => locale.toLowerCase() === normalized)
  if (exact) return exact
  const base = normalized.split('-')[0]
  return SUPPORTED_LOCALES.find((locale) => locale === base) ?? null
}
