import { youtubeVideoProofWatchUrl } from './regear-video-proof'

const YOUTUBE_OEMBED_URL = 'https://www.youtube.com/oembed'
const VIDEO_PROOF_TITLE_TIMEOUT_MS = 2500
export const VIDEO_PROOF_TITLE_MAX_LENGTH = 300

interface YoutubeOEmbedResponse {
  title?: unknown
}

export function normalizeVideoProofTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const title = raw.replace(/\s+/g, ' ').trim()
  if (!title) return null
  return title.length > VIDEO_PROOF_TITLE_MAX_LENGTH
    ? title.slice(0, VIDEO_PROOF_TITLE_MAX_LENGTH).trimEnd()
    : title
}

export async function fetchYoutubeVideoProofTitle(
  embedUrl: string | null | undefined,
): Promise<string | null> {
  const watchUrl = youtubeVideoProofWatchUrl(embedUrl)
  if (!watchUrl) return null

  const params = new URLSearchParams({ url: watchUrl, format: 'json' })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VIDEO_PROOF_TITLE_TIMEOUT_MS)

  try {
    const res = await fetch(`${YOUTUBE_OEMBED_URL}?${params.toString()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const payload = (await res.json()) as YoutubeOEmbedResponse
    return normalizeVideoProofTitle(payload.title)
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}
