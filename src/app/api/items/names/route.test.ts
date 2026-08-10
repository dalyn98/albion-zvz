import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { GET } from './route'

describe('GET /api/items/names', () => {
  it('returns only requested localized names', async () => {
    const request = new NextRequest(
      'https://example.test/api/items/names?locale=en&id=T4_MAIN_SWORD&id=INVALID_ITEM',
    )
    const response = GET(request)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=604800')
    await expect(response.json()).resolves.toEqual({
      names: { T4_MAIN_SWORD: "Adept's Broadsword" },
    })
  })

  it('bounds and validates ids and locale', async () => {
    const params = new URLSearchParams({ locale: 'invalid' })
    params.append('id', '<script>')
    for (let index = 0; index < 70; index += 1) params.append('id', `T4_FAKE_${index}`)

    const response = GET(
      new NextRequest(`https://example.test/api/items/names?${params.toString()}`),
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ names: {} })
  })

  it('returns official Albion names for added and RTL locales', async () => {
    const german = GET(new NextRequest(
      'https://example.test/api/items/names?locale=de&id=T4_MAIN_SWORD',
    ))
    await expect(german.json()).resolves.toEqual({
      names: { T4_MAIN_SWORD: 'Breitschwert des Adepten' },
    })

    const arabic = GET(new NextRequest(
      'https://example.test/api/items/names?locale=ar&id=T4_MAIN_SWORD',
    ))
    await expect(arabic.json()).resolves.toEqual({
      names: { T4_MAIN_SWORD: 'سيف عريض للبارع' },
    })
  })
})
