import {
  SUPPORTED_LOCALES,
  getHreflangLocale,
  isLocale,
  type Locale,
} from '@/i18n/locales'

const FEATURE_ROOT = '/features'
const PUBLIC_FEATURE_ROOT = '/public/features'
const DOCS_ROOT = '/docs'
const PUBLIC_DOCS_ROOT = '/public/docs'
const CANONICAL_ORIGIN = 'https://albion-guildmanager.com'
const MARKETING_STATIC_PATHS = ['/', '/guilds', '/zvz-battles', '/pricing', '/faq', '/privacy', '/terms'] as const

const INTERNAL_MARKETING_STATIC_PATHS: Record<(typeof MARKETING_STATIC_PATHS)[number], string> = {
  '/': '/public/landing',
  '/guilds': '/public/guilds',
  '/zvz-battles': '/public/zvz-battles',
  '/pricing': '/public/pricing',
  '/faq': '/public/faq',
  '/privacy': '/public/privacy',
  '/terms': '/public/terms',
}

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

interface SeoDocsPath {
  locale: SeoLocale | null
  canonicalPathname: string
  unprefixedPathname: string
}

interface SeoMarketingPath {
  locale: SeoLocale | null
  canonicalPathname: string
  unprefixedPathname: (typeof MARKETING_STATIC_PATHS)[number]
}

interface SeoZvzRecordPath {
  locale: SeoLocale | null
  canonicalPathname: string
  unprefixedPathname: string
  internalPathname: string
}

function isMarketingStaticPathname(
  pathname: string,
): pathname is (typeof MARKETING_STATIC_PATHS)[number] {
  return MARKETING_STATIC_PATHS.includes(pathname as (typeof MARKETING_STATIC_PATHS)[number])
}

export function parseSeoMarketingPathname(pathname: string): SeoMarketingPath | null {
  const normalized = normalizeSeoPathname(pathname)
  if (isMarketingStaticPathname(normalized)) {
    return {
      locale: null,
      canonicalPathname: normalized,
      unprefixedPathname: normalized,
    }
  }

  const segments = normalized.split('/').filter(Boolean)
  if (segments.length === 0 || !isLocale(segments[0])) return null
  const unprefixedPathname = `/${segments.slice(1).join('/') || ''}`
  if (!isMarketingStaticPathname(unprefixedPathname)) return null

  return {
    locale: segments[0],
    canonicalPathname: normalized,
    unprefixedPathname,
  }
}

export function getSeoMarketingCanonicalPathname(pathname: string): string | null {
  const normalized = normalizeSeoPathname(pathname)
  for (const [canonicalPathname, internalPathname] of Object.entries(
    INTERNAL_MARKETING_STATIC_PATHS,
  )) {
    if (normalized === internalPathname) return canonicalPathname
  }
  return parseSeoMarketingPathname(normalized)?.canonicalPathname ?? null
}

export function getSeoMarketingInternalPathname(pathname: string): string | null {
  const parsed = parseSeoMarketingPathname(pathname)
  if (!parsed) return null
  return INTERNAL_MARKETING_STATIC_PATHS[parsed.unprefixedPathname]
}

export function getSeoMarketingLocale(pathname: string): SeoLocale | null {
  return parseSeoMarketingPathname(pathname)?.locale ?? null
}

export function getLocalizedSeoMarketingPathname(
  locale: SeoLocale,
  unprefixedPathname: string,
): string {
  const normalized = normalizeSeoPathname(unprefixedPathname)
  if (!isMarketingStaticPathname(normalized)) return `/${locale}`
  return normalized === '/' ? `/${locale}` : `/${locale}${normalized}`
}

export function parseSeoZvzRecordPathname(pathname: string): SeoZvzRecordPath | null {
  const normalized = normalizeSeoPathname(pathname)
  const publicPrefix = '/public'
  const externalPathname = normalized.startsWith(`${publicPrefix}/zvz-battles/`)
    ? normalized.slice(publicPrefix.length)
    : normalized
  const segments = externalPathname.split('/').filter(Boolean)
  const localeSegment = segments[0]
  const locale: SeoLocale | null = isLocale(localeSegment) ? localeSegment : null
  if (locale) segments.shift()

  const isMethodology =
    segments.length === 2 &&
    segments[0] === 'zvz-battles' &&
    segments[1] === 'methodology'
  const isComparison =
    segments.length === 2 &&
    segments[0] === 'zvz-battles' &&
    segments[1] === 'compare'
  const isEntityOrReport =
    segments.length === 4 &&
    segments[0] === 'zvz-battles' &&
    ['guild', 'alliance', 'battle', 'weekly'].includes(segments[1]) &&
    ['west', 'east', 'europe'].includes(segments[2]) &&
    segments[3].length > 0 &&
    (segments[1] !== 'battle' || /^\d{1,12}$/.test(segments[3])) &&
    (segments[1] !== 'weekly' || /^\d{4}-\d{2}-\d{2}$/.test(segments[3]))
  const isBattleSession =
    segments.length === 4 &&
    segments[0] === 'zvz-battles' &&
    segments[1] === 'session' &&
    ['west', 'east', 'europe'].includes(segments[2]) &&
    /^\d{1,12}(,\d{1,12}){0,7}$/.test(segments[3])

  if (!isMethodology && !isComparison && !isEntityOrReport && !isBattleSession) {
    return null
  }

  const unprefixedPathname = `/${segments.join('/')}`
  return {
    locale,
    canonicalPathname: locale
      ? `/${locale}${unprefixedPathname}`
      : unprefixedPathname,
    unprefixedPathname,
    internalPathname: `/public${unprefixedPathname}`,
  }
}

export function getSeoZvzRecordCanonicalPathname(pathname: string): string | null {
  return parseSeoZvzRecordPathname(pathname)?.canonicalPathname ?? null
}

export function getSeoZvzRecordInternalPathname(pathname: string): string | null {
  const parsed = parseSeoZvzRecordPathname(pathname)
  if (!parsed || normalizeSeoPathname(pathname).startsWith('/public/')) return null
  return parsed.internalPathname
}

export function getSeoZvzRecordLocale(pathname: string): SeoLocale | null {
  return parseSeoZvzRecordPathname(pathname)?.locale ?? null
}

export function replaceSeoZvzRecordLocale(
  pathname: string,
  locale: SeoLocale,
): string | null {
  const parsed = parseSeoZvzRecordPathname(pathname)
  return parsed ? `/${locale}${parsed.unprefixedPathname}` : null
}

export function buildSeoZvzRecordLanguageAlternates(
  pathname: string,
): Record<string, string> | null {
  const parsed = parseSeoZvzRecordPathname(pathname)
  if (!parsed) return null
  return {
    'x-default': `${CANONICAL_ORIGIN}${parsed.unprefixedPathname}`,
    ...Object.fromEntries(
      SUPPORTED_LOCALES.map((locale) => [
        getHreflangLocale(locale),
        `${CANONICAL_ORIGIN}/${locale}${parsed.unprefixedPathname}`,
      ]),
    ),
  }
}

export function replaceSeoStaticMarketingLocale(
  pathname: string,
  locale: SeoLocale,
): string | null {
  const canonicalPathname = getSeoMarketingCanonicalPathname(pathname)
  const parsed = canonicalPathname ? parseSeoMarketingPathname(canonicalPathname) : null
  if (!parsed) return null
  return getLocalizedSeoMarketingPathname(locale, parsed.unprefixedPathname)
}

export function buildSeoMarketingLanguageAlternates(
  pathname: string,
): Record<string, string> | null {
  const canonicalPathname = getSeoMarketingCanonicalPathname(pathname)
  const parsed = canonicalPathname ? parseSeoMarketingPathname(canonicalPathname) : null
  if (!parsed) return null

  return {
    'x-default': `${CANONICAL_ORIGIN}${parsed.unprefixedPathname}`,
    ...Object.fromEntries(
      SUPPORTED_LOCALES.map((locale) => [
        getHreflangLocale(locale),
        `${CANONICAL_ORIGIN}${getLocalizedSeoMarketingPathname(locale, parsed.unprefixedPathname)}`,
      ]),
    ),
  }
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

export function parseSeoDocsPathname(pathname: string): SeoDocsPath | null {
  const normalized = normalizeSeoPathname(pathname)
  if (normalized === DOCS_ROOT || normalized.startsWith(`${DOCS_ROOT}/`)) {
    return {
      locale: null,
      canonicalPathname: normalized,
      unprefixedPathname: normalized,
    }
  }

  const segments = normalized.split('/').filter(Boolean)
  if (segments.length >= 2 && isLocale(segments[0]) && segments[1] === 'docs') {
    const unprefixedPathname = `/${segments.slice(1).join('/')}`
    return {
      locale: segments[0],
      canonicalPathname: normalized,
      unprefixedPathname,
    }
  }

  return null
}

export function getSeoDocsCanonicalPathname(pathname: string): string | null {
  const normalized = normalizeSeoPathname(pathname)
  if (normalized === PUBLIC_DOCS_ROOT) return DOCS_ROOT
  if (normalized.startsWith(`${PUBLIC_DOCS_ROOT}/`)) {
    return normalized.slice('/public'.length)
  }
  return parseSeoDocsPathname(normalized)?.canonicalPathname ?? null
}

export function getSeoDocsInternalPathname(pathname: string): string | null {
  const parsed = parseSeoDocsPathname(pathname)
  if (!parsed) return null
  return `/public${parsed.unprefixedPathname}`
}

export function getSeoDocsLocale(pathname: string): SeoLocale | null {
  return parseSeoDocsPathname(pathname)?.locale ?? null
}

export function getLocalizedSeoDocsPathname(
  locale: SeoLocale,
  unprefixedPathname: string,
): string {
  const normalized = normalizeSeoPathname(unprefixedPathname)
  if (normalized === DOCS_ROOT) return `/${locale}${DOCS_ROOT}`
  if (normalized.startsWith(`${DOCS_ROOT}/`)) return `/${locale}${normalized}`
  return `/${locale}${DOCS_ROOT}`
}

export function replaceSeoDocsLocale(
  pathname: string,
  locale: SeoLocale,
): string | null {
  const parsed = parseSeoDocsPathname(pathname)
  if (!parsed) return null
  return getLocalizedSeoDocsPathname(locale, parsed.unprefixedPathname)
}

export function replaceSeoMarketingLocale(
  pathname: string,
  locale: SeoLocale,
): string | null {
  return (
    replaceSeoStaticMarketingLocale(pathname, locale) ??
    replaceSeoZvzRecordLocale(pathname, locale) ??
    replaceSeoFeatureLocale(pathname, locale) ??
    replaceSeoDocsLocale(pathname, locale)
  )
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
        getHreflangLocale(locale),
        `${CANONICAL_ORIGIN}${getLocalizedSeoFeaturePathname(locale, unprefixedPathname)}`,
      ]),
    ),
  }
}

export function buildSeoDocsHomeLanguageAlternates(
  pathname: string,
): Record<string, string> | null {
  const canonicalPathname = getSeoDocsCanonicalPathname(pathname)
  if (!canonicalPathname) return null
  const parsed = parseSeoDocsPathname(canonicalPathname)
  if (parsed?.unprefixedPathname !== DOCS_ROOT) return null

  return {
    'x-default': `${CANONICAL_ORIGIN}${DOCS_ROOT}`,
    ...Object.fromEntries(
      SUPPORTED_LOCALES.map((locale) => [
        getHreflangLocale(locale),
        `${CANONICAL_ORIGIN}${getLocalizedSeoDocsPathname(locale, DOCS_ROOT)}`,
      ]),
    ),
  }
}
