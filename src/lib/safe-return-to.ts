const URL_NORMALIZATION_UNSAFE_CHARS = /[\u0000-\u001F\u007F\\]/

export function sanitizeInternalReturnTo(value: unknown, fallback: string = '/'): string {
  if (typeof value !== 'string') return fallback
  if (URL_NORMALIZATION_UNSAFE_CHARS.test(value)) return fallback
  const path = value.trim()
  if (!path.startsWith('/') || path.startsWith('//')) return fallback
  if (path === '/api' || path.startsWith('/api/')) return fallback
  return path
}
