import { describe, expect, it, vi } from 'vitest'
import { proxyOgBannerImage } from './og-banner-proxy'

const onePixelPng = new Uint8Array([137, 80, 78, 71])

function imageResponse(options: {
  body?: Uint8Array
  contentType?: string
  contentLength?: string
  ok?: boolean
} = {}): Response {
  const headers = new Headers()
  headers.set('content-type', options.contentType ?? 'image/png')
  if (options.contentLength) headers.set('content-length', options.contentLength)
  const body = Uint8Array.from(options.body ?? onePixelPng).buffer
  return new Response(body, {
    status: options.ok === false ? 404 : 200,
    headers,
  })
}

describe('proxyOgBannerImage', () => {
  it('proxies normalized https image URLs with short public cache headers', async () => {
    const fetchBanner = vi.fn(async () => imageResponse({ contentType: 'image/png; charset=utf-8' }))

    const response = await proxyOgBannerImage(' https://cdn.example/banner.png#preview ', fetchBanner)

    expect(fetchBanner).toHaveBeenCalledWith('https://cdn.example/banner.png', { cache: 'no-store' })
    expect(response?.headers.get('content-type')).toBe('image/png')
    expect(response?.headers.get('cache-control')).toBe('public, max-age=300, s-maxage=300')
    expect((await response?.arrayBuffer())?.byteLength).toBe(onePixelPng.byteLength)
  })

  it('rejects non-https, credentialed, non-image, and svg banner URLs', async () => {
    const fetchBanner = vi.fn(async () => imageResponse())

    await expect(proxyOgBannerImage('http://cdn.example/banner.png', fetchBanner)).resolves.toBeNull()
    await expect(proxyOgBannerImage('https://user:pass@cdn.example/banner.png', fetchBanner)).resolves.toBeNull()
    await expect(
      proxyOgBannerImage(
        'https://cdn.example/banner.svg',
        vi.fn(async () => imageResponse({ contentType: 'image/svg+xml' })),
      ),
    ).resolves.toBeNull()
    await expect(
      proxyOgBannerImage(
        'https://cdn.example/banner.html',
        vi.fn(async () => imageResponse({ contentType: 'text/html' })),
      ),
    ).resolves.toBeNull()

    expect(fetchBanner).not.toHaveBeenCalled()
  })

  it('rejects oversized images before and after body download', async () => {
    await expect(
      proxyOgBannerImage(
        'https://cdn.example/too-large-header.png',
        vi.fn(async () => imageResponse({ contentLength: String(5 * 1024 * 1024 + 1) })),
      ),
    ).resolves.toBeNull()

    await expect(
      proxyOgBannerImage(
        'https://cdn.example/too-large-body.png',
        vi.fn(async () =>
          imageResponse({
            body: new Uint8Array(5 * 1024 * 1024 + 1),
          }),
        ),
      ),
    ).resolves.toBeNull()
  })
})
