const META_CONTENT_RE = /content\s*=\s*["']([^"']+)["']/i
const SAFE_TOKEN_RE = /^[A-Za-z0-9_-]{8,256}$/

export function normalizeGoogleSiteVerificationToken(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const metaContent = META_CONTENT_RE.exec(trimmed)?.[1]?.trim()
  const token = metaContent ?? trimmed
  return SAFE_TOKEN_RE.test(token) ? token : null
}
