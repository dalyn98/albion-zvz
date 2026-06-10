import { describe, expect, it } from 'vitest'
import { normalizeYoutubeVideoProofUrl, youtubeVideoProofWatchUrl } from './regear-video-proof'

describe('normalizeYoutubeVideoProofUrl', () => {
  it('normalizes regular and Shorts YouTube video links to safe embed URLs', () => {
    expect(normalizeYoutubeVideoProofUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    )
    expect(normalizeYoutubeVideoProofUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    )
  })

  it('allows empty proof links but rejects playlists and non-YouTube URLs', () => {
    expect(normalizeYoutubeVideoProofUrl('')).toBeNull()
    expect(normalizeYoutubeVideoProofUrl('   ')).toBeNull()
    expect(
      normalizeYoutubeVideoProofUrl(
        'https://www.youtube.com/playlist?list=PLrAXtmRdnEQyV0xj-W2yQjAQ-jL0PpKkX',
      ),
    ).toBeNull()
    expect(normalizeYoutubeVideoProofUrl('https://vimeo.com/123456')).toBeNull()
  })
})

describe('youtubeVideoProofWatchUrl', () => {
  it('converts stored embed proof URLs to normal watch URLs for external opening', () => {
    expect(youtubeVideoProofWatchUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    )
  })

  it('rejects malformed or empty stored proof URLs', () => {
    expect(youtubeVideoProofWatchUrl(null)).toBeNull()
    expect(youtubeVideoProofWatchUrl('')).toBeNull()
    expect(youtubeVideoProofWatchUrl('https://www.youtube.com/embed/short')).toBeNull()
    expect(youtubeVideoProofWatchUrl('https://evil.example/embed/dQw4w9WgXcQ')).toBeNull()
  })
})
