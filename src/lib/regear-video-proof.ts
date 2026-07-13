import { toYoutubeEmbedUrl } from './youtube-embed'

const YOUTUBE_VIDEO_EMBED_PATTERN = /^https:\/\/www\.youtube\.com\/embed\/([\w-]{11})$/

export function normalizeYoutubeVideoProofUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const embedUrl = toYoutubeEmbedUrl(trimmed)
  if (!embedUrl) return null
  return YOUTUBE_VIDEO_EMBED_PATTERN.test(embedUrl) ? embedUrl : null
}

// URL 형태가 달라도 같은 YouTube 원본 영상은 같은 canonical ID 로 취급한다.
// 연합 컨텐츠 영상 의무에서는 이 값을 tenant-scoped unique key 로 저장해 같은
// 영상이 다른 3회 묶음을 다시 충족시키는 일을 막는다.
export function getYoutubeVideoProofId(raw: string): string | null {
  const embedUrl = normalizeYoutubeVideoProofUrl(raw)
  const match = embedUrl ? YOUTUBE_VIDEO_EMBED_PATTERN.exec(embedUrl) : null
  return match?.[1] ?? null
}

export function youtubeVideoProofWatchUrl(embedUrl: string | null | undefined): string | null {
  if (!embedUrl) return null
  const match = YOUTUBE_VIDEO_EMBED_PATTERN.exec(embedUrl.trim())
  if (!match) return null
  return `https://www.youtube.com/watch?v=${match[1]}`
}
