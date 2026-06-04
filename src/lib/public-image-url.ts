export const PUBLIC_IMAGE_URL_MAX_LENGTH = 2048

export function normalizePublicImageUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed || trimmed.length > PUBLIC_IMAGE_URL_MAX_LENGTH) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.protocol !== 'https:') return null
  if (!url.hostname || url.username || url.password) return null

  url.hash = ''
  return url.toString()
}
