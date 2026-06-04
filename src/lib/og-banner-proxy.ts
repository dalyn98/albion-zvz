import 'server-only'
import { normalizePublicImageUrl } from '@/lib/public-image-url'

const MAX_OG_BANNER_BYTES = 5 * 1024 * 1024
const ALLOWED_OG_IMAGE_CONTENT_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

type FetchBanner = (input: string, init: RequestInit) => Promise<Response>

function normalizedContentType(value: string | null): string | null {
  const mediaType = value?.split(';', 1)[0]?.trim().toLowerCase() ?? ''
  return mediaType || null
}

function contentLengthTooLarge(value: string | null): boolean {
  if (!value) return false
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > MAX_OG_BANNER_BYTES
}

export async function proxyOgBannerImage(
  rawBannerUrl: string,
  fetchBanner: FetchBanner = fetch,
): Promise<Response | null> {
  const bannerUrl = normalizePublicImageUrl(rawBannerUrl)
  if (!bannerUrl) return null

  try {
    const res = await fetchBanner(bannerUrl, { cache: 'no-store' })
    if (!res.ok) return null
    const contentType = normalizedContentType(res.headers.get('content-type'))
    if (!contentType || !ALLOWED_OG_IMAGE_CONTENT_TYPES.has(contentType)) return null
    if (contentLengthTooLarge(res.headers.get('content-length'))) return null

    const buf = await res.arrayBuffer()
    if (buf.byteLength > MAX_OG_BANNER_BYTES) return null

    return new Response(buf, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=300, s-maxage=300',
      },
    })
  } catch {
    return null
  }
}
