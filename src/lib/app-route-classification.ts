import {
  getSeoDocsCanonicalPathname,
  getSeoFeatureCanonicalPathname,
  parseSeoDocsPathname,
} from '@/lib/seo-locale-paths'

function normalizePathname(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || '/'
  if (pathOnly.length <= 1) return pathOnly
  return pathOnly.replace(/\/+$/, '')
}

const DIRECT_INDEXABLE_PATHS = new Set([
  '/',
  '/features',
  '/zvz-battles',
  '/pricing',
  '/faq',
  '/privacy',
  '/terms',
  '/docs',
  '/demo',
])

const ROOT_SESSION_SKIPPABLE_PUBLIC_PATHS = new Set([
  '/public/landing',
  '/public/features',
  '/public/zvz-battles',
  '/public/pricing',
  '/public/faq',
  '/public/privacy',
  '/public/terms',
  '/public/docs',
  '/invite/open',
])

function normalizePublicCanonicalPathname(pathname: string): string | null {
  if (pathname === '/public/landing') return '/'
  if (pathname === '/public/zvz-battles') return '/zvz-battles'
  if (pathname === '/public/pricing') return '/pricing'
  if (pathname === '/public/faq') return '/faq'
  if (pathname === '/public/privacy') return '/privacy'
  if (pathname === '/public/terms') return '/terms'
  if (pathname === '/public/docs') return '/docs'
  if (pathname.startsWith('/public/docs/')) return pathname.slice('/public'.length)
  if (isPublicBattleGroupPathname(pathname)) return null
  if (pathname.startsWith('/public/g/')) return pathname.slice('/public'.length)
  return null
}

export function isPublicBattleGroupPathname(pathname: string): boolean {
  const segments = normalizePathname(pathname).split('/').filter(Boolean)
  if (
    segments.length === 5 &&
    segments[0] === 'public' &&
    segments[1] === 'g' &&
    segments[2].length > 0 &&
    segments[3] === 'battles' &&
    segments[4] === 'multi'
  ) {
    return true
  }
  return (
    segments.length === 4 &&
    segments[0] === 'g' &&
    segments[1].length > 0 &&
    segments[2] === 'battles' &&
    segments[3] === 'multi'
  )
}

export function isPublicEventDetailPathname(pathname: string): boolean {
  const segments = normalizePathname(pathname).split('/').filter(Boolean)
  return segments.length === 2 && segments[0] === 'events' && segments[1].length > 0
}

// Routes that should render for anyone, even without a session. The proxy
// forwards the pathname via x-pathname so RootLayout can decide without
// duplicating matcher logic.
export function isPublicPathname(pathname: string): boolean {
  const normalized = normalizePathname(pathname)
  if (normalized.startsWith('/public/')) return true
  if (getSeoFeatureCanonicalPathname(normalized)) return true
  if (getSeoDocsCanonicalPathname(normalized)) return true
  if (normalized === '/demo' || normalized.startsWith('/demo/')) return true
  if (normalized === '/guild-login') return true
  if (normalized === '/invite/open') return true
  if (isPublicEventDetailPathname(normalized)) return true
  return false
}

export function shouldSkipRootSessionForPathname(pathname: string): boolean {
  const normalized = normalizePathname(pathname)
  if (normalized === '/demo' || normalized.startsWith('/demo/')) return true
  if (isPublicBattleGroupPathname(normalized)) return true
  if (normalized.startsWith('/public/g/')) return false
  if (normalized === '/public/u' || normalized.startsWith('/public/u/')) return true
  if (normalized.startsWith('/public/docs/')) return true
  if (ROOT_SESSION_SKIPPABLE_PUBLIC_PATHS.has(normalized)) return true
  if (getSeoFeatureCanonicalPathname(normalized)) return true
  if (getSeoDocsCanonicalPathname(normalized)) return true
  return false
}

// canonical root host의 마케팅/공개 surface만 검색 인덱싱을 허용한다.
// headers(), sitemap(), metadata() 정책이 같은 path 집합을 유지해야 한다.
export function getCanonicalIndexablePathname(pathname: string): string | null {
  const normalized = normalizePathname(pathname)
  const seoFeatureCanonical = getSeoFeatureCanonicalPathname(normalized)
  if (seoFeatureCanonical) return seoFeatureCanonical
  const parsedSeoDocs = parseSeoDocsPathname(normalized)
  if (parsedSeoDocs) {
    if (
      parsedSeoDocs.locale &&
      parsedSeoDocs.unprefixedPathname !== '/docs'
    ) {
      return null
    }
    return parsedSeoDocs.canonicalPathname
  }
  const seoDocsCanonical = getSeoDocsCanonicalPathname(normalized)
  if (seoDocsCanonical) return seoDocsCanonical
  const publicCanonical = normalizePublicCanonicalPathname(normalized)
  if (publicCanonical) return publicCanonical
  if (DIRECT_INDEXABLE_PATHS.has(normalized)) return normalized
  if (normalized.startsWith('/docs/')) return normalized
  if (isPublicBattleGroupPathname(normalized)) return null
  if (normalized.startsWith('/g/')) return normalized
  return null
}

export function isIndexablePathname(pathname: string): boolean {
  return getCanonicalIndexablePathname(pathname) !== null
}
