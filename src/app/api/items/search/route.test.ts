import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

describe('GET /api/items/search', () => {
  it('returns a bounded result set for normal item searches', async () => {
    const response = GET(new NextRequest('https://example.test/api/items/search?q=sword&category=weapon&tier=4'))
    const body = await response.json()

    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeLessThanOrEqual(30)
    expect(body.every((item: { uniqueName?: unknown }) => typeof item.uniqueName === 'string')).toBe(true)
  })

  it('returns an empty list for oversized queries before scanning the bundle', async () => {
    const q = 's'.repeat(81)
    const response = GET(new NextRequest(`https://example.test/api/items/search?q=${q}`))

    await expect(response.json()).resolves.toEqual([])
  })

  it('ignores invalid category and tier filters without failing the public helper API', async () => {
    const response = GET(
      new NextRequest('https://example.test/api/items/search?q=sword&category=<script>&tier=999'),
    )
    const body = await response.json()

    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeLessThanOrEqual(30)
  })

  it('keeps the T8 greataxe discoverable by common slot names', async () => {
    const queries = ['그레이트액스', 'great axe', 'greataxe']

    for (const q of queries) {
      const response = GET(
        new NextRequest(`https://example.test/api/items/search?q=${encodeURIComponent(q)}&category=weapon&tier=8`),
      )
      const body = await response.json()

      expect(body).toContainEqual(
        expect.objectContaining({
          uniqueName: 'T8_2H_AXE',
          displayName: '장로의 그레이트액스',
        }),
      )
    }
  })

  it('marks locale-cookie dependent search responses as varying by cookie', () => {
    const response = GET(new NextRequest('https://example.test/api/items/search?q=sword'))

    expect(response.headers.get('vary')).toBe('Cookie')
    expect(response.headers.get('cache-control')).toBe('private, max-age=3600')
  })
})
