import {
  DETECTION_FALLBACK_LOCALE,
  type Locale,
  resolveSupportedLocale,
} from '@/i18n/locales'

interface LanguagePreference {
  tag: string
  q: number
  index: number
}

function normalizeLocaleTag(tag: string): Locale | null {
  return resolveSupportedLocale(tag)
}

export function detectLocaleFromAcceptLanguage(
  header: string | null | undefined,
  fallback: Locale = DETECTION_FALLBACK_LOCALE,
): Locale {
  if (!header) return fallback
  const preferences: LanguagePreference[] = []

  for (const [index, rawPart] of header.split(',').entries()) {
    const [rawTag, ...params] = rawPart.trim().split(';')
    if (!rawTag) continue
    let q = 1
    for (const param of params) {
      const [key, value] = param.trim().split('=')
      if (key.toLowerCase() !== 'q') continue
      const parsed = Number(value)
      if (Number.isFinite(parsed)) q = parsed
    }
    if (q <= 0) continue
    preferences.push({ tag: rawTag, q, index })
  }

  preferences.sort((a, b) => b.q - a.q || a.index - b.index)
  for (const preference of preferences) {
    const locale = normalizeLocaleTag(preference.tag)
    if (locale) return locale
  }

  return fallback
}
