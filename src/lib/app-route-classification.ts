function normalizePathname(pathname: string): string {
  const pathOnly = pathname.split(/[?#]/, 1)[0] || '/'
  if (pathOnly.length <= 1) return pathOnly
  return pathOnly.replace(/\/+$/, '')
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
  if (normalized === '/demo' || normalized.startsWith('/demo/')) return true
  if (normalized === '/guild-login') return true
  if (isPublicEventDetailPathname(normalized)) return true
  return false
}

// canonical root host의 마케팅/공개 surface만 검색 인덱싱을 허용한다.
// headers(), sitemap(), metadata() 정책이 같은 path 집합을 유지해야 한다.
export function isIndexablePathname(pathname: string): boolean {
  const normalized = normalizePathname(pathname)
  if (normalized === '/') return true
  if (
    normalized === '/pricing' ||
    normalized === '/features' ||
    normalized === '/faq' ||
    normalized === '/privacy' ||
    normalized === '/terms' ||
    normalized === '/docs' ||
    normalized.startsWith('/docs/')
  ) return true
  if (normalized === '/g' || normalized.startsWith('/g/')) return true
  if (normalized === '/demo' || normalized.startsWith('/demo/')) return true
  // 캐노니컬 호스트에서 proxy rewrite가 안 걸린 직접 path도 동일하게 허용.
  if (
    normalized === '/public/landing' ||
    normalized === '/public/features' ||
    normalized === '/public/pricing' ||
    normalized === '/public/faq' ||
    normalized === '/public/privacy' ||
    normalized === '/public/terms'
  ) return true
  if (normalized === '/public/docs' || normalized.startsWith('/public/docs/')) return true
  if (normalized === '/public/g' || normalized.startsWith('/public/g/')) return true
  return false
}
