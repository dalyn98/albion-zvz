import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type Locale,
  isLocale,
} from '@/i18n/locales'

interface LanguagePreference {
  tag: string
  q: number
  index: number
}

function normalizeLocaleTag(tag: string): Locale | null {
  const lower = tag.trim().toLowerCase()
  if (!lower || lower === '*') return null
  const base = lower.split('-')[0]
  return isLocale(base) ? base : null
}

export function detectLocaleFromAcceptLanguage(
  header: string | null | undefined,
  fallback: Locale = DEFAULT_LOCALE,
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
    if (locale && (SUPPORTED_LOCALES as readonly string[]).includes(locale)) return locale
  }

  return fallback
}
