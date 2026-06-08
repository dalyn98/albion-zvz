import {
  SUPPORTED_LOCALES,
  isLocale,
  type Locale,
} from '@/i18n/locales'

const FEATURE_ROOT = '/features'
const PUBLIC_FEATURE_ROOT = '/public/features'
const CANONICAL_ORIGIN = 'https://albion-guildmanager.com'

export type SeoLocale = Locale

export function normalizeSeoPathname(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || '/'
  if (pathOnly.length <= 1) return pathOnly
  return pathOnly.replace(/\/+$/, '')
}

interface SeoFeaturePath {
  locale: SeoLocale | null
  canonicalPathname: string
  unprefixedPathname: string
}

export function parseSeoFeaturePathname(pathname: string): SeoFeaturePath | null {
  const normalized = normalizeSeoPathname(pathname)
  if (normalized === FEATURE_ROOT || normalized.startsWith(`${FEATURE_ROOT}/`)) {
    return {
      locale: null,
      canonicalPathname: normalized,
      unprefixedPathname: normalized,
    }
  }

  const segments = normalized.split('/').filter(Boolean)
  if (segments.length >= 2 && isLocale(segments[0]) && segments[1] === 'features') {
    const unprefixedPathname = `/${segments.slice(1).join('/')}`
    return {
      locale: segments[0],
      canonicalPathname: normalized,
      unprefixedPathname,
    }
  }

  return null
}

export function getSeoFeatureCanonicalPathname(pathname: string): string | null {
  const normalized = normalizeSeoPathname(pathname)
  if (normalized === PUBLIC_FEATURE_ROOT) return FEATURE_ROOT
  if (normalized.startsWith(`${PUBLIC_FEATURE_ROOT}/`)) {
    return normalized.slice('/public'.length)
  }
  return parseSeoFeaturePathname(normalized)?.canonicalPathname ?? null
}

export function getSeoFeatureInternalPathname(pathname: string): string | null {
  const parsed = parseSeoFeaturePathname(pathname)
  if (!parsed) return null
  return `/public${parsed.unprefixedPathname}`
}

export function getSeoFeatureLocale(pathname: string): SeoLocale | null {
  return parseSeoFeaturePathname(pathname)?.locale ?? null
}

export function getSeoFeatureUnprefixedPathname(pathname: string): string | null {
  return parseSeoFeaturePathname(pathname)?.unprefixedPathname ?? null
}

export function getLocalizedSeoFeaturePathname(
  locale: SeoLocale,
  unprefixedPathname: string,
): string {
  const normalized = normalizeSeoPathname(unprefixedPathname)
  if (normalized === FEATURE_ROOT) return `/${locale}${FEATURE_ROOT}`
  if (normalized.startsWith(`${FEATURE_ROOT}/`)) return `/${locale}${normalized}`
  return `/${locale}${FEATURE_ROOT}`
}

export function replaceSeoFeatureLocale(
  pathname: string,
  locale: SeoLocale,
): string | null {
  const parsed = parseSeoFeaturePathname(pathname)
  if (!parsed) return null
  return getLocalizedSeoFeaturePathname(locale, parsed.unprefixedPathname)
}

export function buildSeoFeatureLanguageAlternates(
  pathname: string,
): Record<string, string> | null {
  const canonicalPathname = getSeoFeatureCanonicalPathname(pathname)
  if (!canonicalPathname) return null
  const parsed = parseSeoFeaturePathname(canonicalPathname)
  const unprefixedPathname = parsed?.unprefixedPathname
  if (!unprefixedPathname) return null

  return {
    'x-default': `${CANONICAL_ORIGIN}${unprefixedPathname}`,
    ...Object.fromEntries(
      SUPPORTED_LOCALES.map((locale) => [
        locale,
        `${CANONICAL_ORIGIN}${getLocalizedSeoFeaturePathname(locale, unprefixedPathname)}`,
      ]),
    ),
  }
}
