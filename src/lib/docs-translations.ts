import catalog from '@/content/docs-translations.json'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/locales'

interface DocsTranslationCatalog {
  sourceLocale: string
  sourceDigest: string
  sourceStrings: number
  locales: Partial<Record<Locale, Record<string, string>>>
}

const docsCatalog = catalog as DocsTranslationCatalog

export function getLocalizedDocsText(locale: Locale, source: string): string {
  if (locale === DEFAULT_LOCALE || !source.trim()) return source
  const translations = docsCatalog.locales[locale]
  if (!translations) return source
  const exact = translations[source]
  if (exact) return exact
  const trimmed = source.trim()
  const translated = translations[trimmed]
  if (!translated) return source
  const start = source.indexOf(trimmed)
  return `${source.slice(0, start)}${translated}${source.slice(start + trimmed.length)}`
}

export function hasCompleteDocsTranslation(locale: Locale): boolean {
  if (locale === DEFAULT_LOCALE) return true
  const translations = docsCatalog.locales[locale]
  return Boolean(
    docsCatalog.sourceStrings > 0 &&
      translations &&
      Object.keys(translations).length === docsCatalog.sourceStrings,
  )
}
