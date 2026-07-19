import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route'

function request(body: string, headers?: HeadersInit): NextRequest {
  return new NextRequest('https://example.test/api/items/cooldowns', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body,
  })
}

describe('POST /api/items/cooldowns', () => {
  it('rejects oversized declared payloads before parsing them', async () => {
    const response = await POST(request('{}', { 'Content-Length': '100001' }))

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({ error: 'payload_too_large' })
  })

  it('rejects malformed JSON and oversized batches', async () => {
    const malformed = await POST(request('{'))
    expect(malformed.status).toBe(400)

    const oversized = await POST(request(JSON.stringify({
      entries: Array.from({ length: 51 }, () => ({})),
    })))
    expect(oversized.status).toBe(400)
  })

  it('returns only valid bounded cooldown entries', async () => {
    const response = await POST(request(JSON.stringify({
      entries: [
        { key: 'valid', spellId: 'T3_FIND_TRACK', slot: {} },
        { key: 'invalid', spellId: '<script>', slot: {} },
      ],
    })))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      results: {
        valid: {
          baseCd: 17,
          sources: [],
          totalRaw: 0,
          effectiveCd: 17,
        },
      },
    })
  })
})
