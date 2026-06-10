import { toYoutubeEmbedUrl } from './youtube-embed'

const YOUTUBE_VIDEO_EMBED_PATTERN = /^https:\/\/www\.youtube\.com\/embed\/([\w-]{11})$/

export function normalizeYoutubeVideoProofUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const embedUrl = toYoutubeEmbedUrl(trimmed)
  if (!embedUrl) return null
  return YOUTUBE_VIDEO_EMBED_PATTERN.test(embedUrl) ? embedUrl : null
}

export function youtubeVideoProofWatchUrl(embedUrl: string | null | undefined): string | null {
  if (!embedUrl) return null
  const match = YOUTUBE_VIDEO_EMBED_PATTERN.exec(embedUrl.trim())
  if (!match) return null
  return `https://www.youtube.com/watch?v=${match[1]}`
}
