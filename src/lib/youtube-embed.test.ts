import { describe, it, expect } from 'vitest'
import { toYoutubeEmbedUrl } from './youtube-embed'

describe('toYoutubeEmbedUrl', () => {
  it('returns null for empty/whitespace input', () => {
    expect(toYoutubeEmbedUrl('')).toBeNull()
    expect(toYoutubeEmbedUrl('   ')).toBeNull()
  })

  it('returns null for non-URL strings', () => {
    expect(toYoutubeEmbedUrl('hello')).toBeNull()
    expect(toYoutubeEmbedUrl('not a url')).toBeNull()
  })

  it('returns null for non-YouTube hosts', () => {
    expect(toYoutubeEmbedUrl('https://vimeo.com/123456')).toBeNull()
    expect(toYoutubeEmbedUrl('https://evil.com/embed/abc')).toBeNull()
    expect(toYoutubeEmbedUrl('https://youtube.com.evil.com/watch?v=abc')).toBeNull()
  })

  it('rejects non-http(s) protocols', () => {
    expect(toYoutubeEmbedUrl('javascript:alert(1)')).toBeNull()
    expect(toYoutubeEmbedUrl('data:text/html,<script>')).toBeNull()
  })

  it('parses watch?v= URLs', () => {
    expect(toYoutubeEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    )
    expect(toYoutubeEmbedUrl('https://youtube.com/watch?v=dQw4w9WgXcQ&t=5')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    )
  })

  it('parses youtu.be short URLs', () => {
    expect(toYoutubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    )
    expect(toYoutubeEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=5')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    )
  })

  it('parses /embed/ URLs (idempotent)', () => {
    expect(toYoutubeEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    )
  })

  it('parses playlist URLs', () => {
    expect(
      toYoutubeEmbedUrl('https://www.youtube.com/playlist?list=PLrAXtmRdnEQyV0xj-W2yQjAQ-jL0PpKkX'),
    ).toBe('https://www.youtube.com/embed/videoseries?list=PLrAXtmRdnEQyV0xj-W2yQjAQ-jL0PpKkX')
  })

  it('parses /embed/videoseries playlist URLs', () => {
    expect(
      toYoutubeEmbedUrl(
        'https://www.youtube.com/embed/videoseries?list=PLrAXtmRdnEQyV0xj-W2yQjAQ-jL0PpKkX',
      ),
    ).toBe('https://www.youtube.com/embed/videoseries?list=PLrAXtmRdnEQyV0xj-W2yQjAQ-jL0PpKkX')
  })

  it('rejects malformed video IDs', () => {
    // 11자 미만
    expect(toYoutubeEmbedUrl('https://www.youtube.com/watch?v=short')).toBeNull()
    // 11자 초과
    expect(toYoutubeEmbedUrl('https://www.youtube.com/watch?v=way_too_long_id')).toBeNull()
    // 특수문자
    expect(toYoutubeEmbedUrl('https://www.youtube.com/watch?v=a!b@c#d$e%f')).toBeNull()
  })

  it('rejects /channel/, /shorts/, /c/ paths', () => {
    expect(toYoutubeEmbedUrl('https://www.youtube.com/channel/UC123')).toBeNull()
    expect(toYoutubeEmbedUrl('https://www.youtube.com/shorts/abc')).toBeNull()
    expect(toYoutubeEmbedUrl('https://www.youtube.com/c/somechannel')).toBeNull()
  })

  it('rejects watch URL without v param', () => {
    expect(toYoutubeEmbedUrl('https://www.youtube.com/watch')).toBeNull()
    expect(toYoutubeEmbedUrl('https://www.youtube.com/watch?t=5')).toBeNull()
  })
})
