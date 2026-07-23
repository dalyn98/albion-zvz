const URL_NORMALIZATION_UNSAFE_CHARS = /[\u0000-\u001F\u007F\\]/
export const MAX_INTERNAL_RETURN_TO_LENGTH = 2048

export function sanitizeInternalReturnTo(value: unknown, fallback: string = '/'): string {
  if (typeof value !== 'string') return fallback
  if (URL_NORMALIZATION_UNSAFE_CHARS.test(value)) return fallback
  const path = value.trim()
  if (path.length > MAX_INTERNAL_RETURN_TO_LENGTH) return fallback
  if (!path.startsWith('/') || path.startsWith('//')) return fallback
  if (path === '/api' || path.startsWith('/api/')) return fallback
  return path
}
