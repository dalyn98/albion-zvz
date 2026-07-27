import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { GET } from './route'

describe('GET /admin/dashboard/regear', () => {
  it('redirects legacy links to the canonical regear approval queue', () => {
    const response = GET(
      new NextRequest('https://guild.example.test/admin/dashboard/regear'),
    )

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe(
      'https://guild.example.test/admin/dashboard/approvals?origin=all',
    )
  })

  it('preserves only the supported all-scope filter', () => {
    const response = GET(
      new NextRequest(
        'https://guild.example.test/admin/dashboard/regear?scope=all&unsafe=value',
      ),
    )

    expect(response.headers.get('location')).toBe(
      'https://guild.example.test/admin/dashboard/approvals?origin=all&scope=all',
    )
  })
})
