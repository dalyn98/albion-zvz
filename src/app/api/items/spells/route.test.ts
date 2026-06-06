import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

describe('GET /api/items/spells', () => {
  it('deduplicates item ids and keeps known spell pools addressable', async () => {
    const response = GET(
      new NextRequest('https://example.test/api/items/spells?id=T4_MAIN_SWORD&id=T4_MAIN_SWORD'),
    )
    const body = await response.json()

    expect(Object.keys(body)).toEqual(['T4_MAIN_SWORD'])
    expect(Array.isArray(body.T4_MAIN_SWORD)).toBe(true)
  })

  it('serves enchantment variants from the base item spell pool', async () => {
    const response = GET(
      new NextRequest('https://example.test/api/items/spells?id=T4_MAIN_SWORD&id=T4_MAIN_SWORD@1'),
    )
    const body = await response.json()

    expect(Object.keys(body)).toEqual(['T4_MAIN_SWORD', 'T4_MAIN_SWORD@1'])
    expect(body['T4_MAIN_SWORD@1']).toEqual(body.T4_MAIN_SWORD)
  })

  it('caps normalized ids and skips oversized or malformed values', async () => {
    const params = new URLSearchParams()
    params.append('id', 'A'.repeat(81))
    params.append('id', 'T4_MAIN_SWORD<script>')
    for (let i = 0; i < 70; i += 1) params.append('id', `T4_FAKE_ITEM_${i}`)

    const response = GET(new NextRequest(`https://example.test/api/items/spells?${params.toString()}`))
    const body = await response.json()

    expect(Object.keys(body)).toHaveLength(64)
    expect(body).not.toHaveProperty('T4_MAIN_SWORD<script>')
  })

  it('marks static spell lookups as CDN-cacheable', () => {
    const response = GET(
      new NextRequest('https://example.test/api/items/spells?id=T4_MAIN_SWORD'),
    )

    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800',
    )
  })
})
