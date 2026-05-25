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
