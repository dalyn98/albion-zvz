// 어드민이 붙여넣은 YouTube URL 을 안전한 embed URL 로 정규화. 임의 iframe src
// 허용은 XSS 벡터 — 화이트리스트 호스트 + 화이트리스트 path + ID 패턴 검증을
// 모두 통과해야 embed URL 을 돌려준다.
// 허용 입력 형태:
//   - https://www.youtube.com/watch?v=<id>
//   - https://youtu.be/<id>
//   - https://www.youtube.com/embed/<id>
//   - https://www.youtube.com/shorts/<id>
//   - https://www.youtube.com/playlist?list=<id>
//   - https://www.youtube.com/embed/videoseries?list=<id>
// 그 외 (다른 호스트, channel 등) 는 null.

const VIDEO_ID_PATTERN = /^[\w-]{11}$/
const PLAYLIST_ID_PATTERN = /^[\w-]{12,}$/

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com'])
const YT_SHORT_HOST = 'youtu.be'

export function toYoutubeEmbedUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase()

  if (host === YT_SHORT_HOST) {
    const id = url.pathname.slice(1).split('/')[0]
    if (!VIDEO_ID_PATTERN.test(id)) return null
    return `https://www.youtube.com/embed/${id}`
  }

  if (!YT_HOSTS.has(host)) return null

  if (url.pathname.startsWith('/embed/')) {
    const segment = url.pathname.slice('/embed/'.length).split('/')[0]
    if (segment === 'videoseries') {
      const list = url.searchParams.get('list')
      if (list && PLAYLIST_ID_PATTERN.test(list)) {
        return `https://www.youtube.com/embed/videoseries?list=${list}`
      }
      return null
    }
    if (!VIDEO_ID_PATTERN.test(segment)) return null
    return `https://www.youtube.com/embed/${segment}`
  }

  if (url.pathname === '/watch') {
    const id = url.searchParams.get('v')
    if (!id || !VIDEO_ID_PATTERN.test(id)) return null
    return `https://www.youtube.com/embed/${id}`
  }

  if (url.pathname.startsWith('/shorts/')) {
    const id = url.pathname.slice('/shorts/'.length).split('/')[0]
    if (!VIDEO_ID_PATTERN.test(id)) return null
    return `https://www.youtube.com/embed/${id}`
  }

  if (url.pathname === '/playlist') {
    const list = url.searchParams.get('list')
    if (!list || !PLAYLIST_ID_PATTERN.test(list)) return null
    return `https://www.youtube.com/embed/videoseries?list=${list}`
  }

  return null
}
