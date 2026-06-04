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

  it('marks locale-cookie dependent search responses as varying by cookie', () => {
    const response = GET(new NextRequest('https://example.test/api/items/search?q=sword'))

    expect(response.headers.get('vary')).toBe('Cookie')
  })
})
