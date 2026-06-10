import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  VIDEO_PROOF_TITLE_MAX_LENGTH,
  fetchYoutubeVideoProofTitle,
  normalizeVideoProofTitle,
} from './regear-video-proof-metadata'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizeVideoProofTitle', () => {
  it('trims, collapses whitespace, and caps stored titles', () => {
    expect(normalizeVideoProofTitle('  ZvZ\nPOV\tReview  ')).toBe('ZvZ POV Review')
    expect(normalizeVideoProofTitle('x'.repeat(VIDEO_PROOF_TITLE_MAX_LENGTH + 10))).toHaveLength(
      VIDEO_PROOF_TITLE_MAX_LENGTH,
    )
  })

  it('rejects empty or non-string titles', () => {
    expect(normalizeVideoProofTitle('   ')).toBeNull()
    expect(normalizeVideoProofTitle(null)).toBeNull()
  })
})

describe('fetchYoutubeVideoProofTitle', () => {
  it('loads the oEmbed title for a stored YouTube embed proof URL', async () => {
    const fetchMock = vi.fn<(...args: Parameters<typeof fetch>) => Promise<Response>>(async () =>
      new Response(JSON.stringify({ title: 'Menhera ZvZ POV' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchYoutubeVideoProofTitle('https://www.youtube.com/embed/dQw4w9WgXcQ'),
    ).resolves.toBe('Menhera ZvZ POV')

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(String(url)).toContain('https://www.youtube.com/oembed?')
    expect(String(url)).toContain(
      'url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ',
    )
    expect(init).toMatchObject({ cache: 'no-store' })
  })

  it('returns null when the URL or oEmbed response is not usable', async () => {
    const fetchMock = vi.fn<(...args: Parameters<typeof fetch>) => Promise<Response>>(async () =>
      new Response(JSON.stringify({ title: '' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchYoutubeVideoProofTitle('https://evil.example/embed/dQw4w9WgXcQ'),
    ).resolves.toBeNull()
    await expect(
      fetchYoutubeVideoProofTitle('https://www.youtube.com/embed/dQw4w9WgXcQ'),
    ).resolves.toBeNull()
  })

  it('treats oEmbed failures as missing metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    )

    await expect(
      fetchYoutubeVideoProofTitle('https://www.youtube.com/embed/dQw4w9WgXcQ'),
    ).resolves.toBeNull()
  })
})
