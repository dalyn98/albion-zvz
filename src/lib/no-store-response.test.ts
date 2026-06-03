import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NextResponse } from 'next/server'
import { withNoStore } from './no-store-response'

function listRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listRouteFiles(path)
    return entry.name === 'route.ts' ? [path] : []
  })
}

describe('withNoStore', () => {
  it('marks a NextResponse as non-cacheable', () => {
    const response = withNoStore(NextResponse.json({ ok: true }))

    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0')
    expect(response.headers.get('pragma')).toBe('no-cache')
    expect(response.headers.get('expires')).toBe('0')
  })

  it('keeps admin API route JSON responses behind no-store wrappers', () => {
    const routeFiles = listRouteFiles(join(process.cwd(), 'src/app/api/admin'))
    const offenders = routeFiles.filter((file) => {
      const source = readFileSync(file, 'utf8')
      return /\breturn\s+NextResponse\.json\s*\(/.test(source) || /\breturn\s+authError\b/.test(source)
    })

    expect(offenders.map((file) => file.replace(process.cwd(), '.'))).toEqual([])
  })
})
